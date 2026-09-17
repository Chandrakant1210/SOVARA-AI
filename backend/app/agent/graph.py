import ollama
from langgraph.graph import StateGraph, END
from app.agent.state import AgentState
from app.config.model_registry import get_model_for_capability
from app.services.docx_service import generate_approval_note
from app.services.embedding_service import get_embedding
from app.services.qdrant_service import search


def _call_reasoning_model(prompt: str) -> str:
    """Calls the registered reasoning model via Ollama and returns its text response."""
    model_name = get_model_for_capability("reasoning")["model_name"]
    response = ollama.chat(
        model=model_name,
        messages=[{"role": "user", "content": prompt}],
    )
    return response["message"]["content"]


def understand_node(state: AgentState) -> dict:
    """
    Reads the user's request (and any document text) and produces a
    clear restatement of the actual task, to guide the rest of the graph.
    """
    prompt = (
        "You are an industrial AI assistant. Read the following request "
        "and document content, then write a short, clear restatement of "
        "what needs to be done. Do not answer yet, just clarify the task.\n\n"
        f"User request: {state['user_input']}\n\n"
        f"Document content: {state.get('document_text') or '(none provided)'}"
    )
    understanding = _call_reasoning_model(prompt)
    return {
        "understanding": understanding,
        "steps_completed": state.get("steps_completed", []) + ["understand"],
    }


def plan_node(state: AgentState) -> dict:
    """
    Given the clarified task understanding, produces a short plan of
    what the agent will do next — what to retrieve, what to check.
    Currently informational (guides prompting in later nodes) rather
    than branching the graph; establishes the seam for future
    conditional routing (e.g. skipping retrieval if not needed).
    """
    prompt = (
        "Based on the task understanding below, write a short, numbered "
        "plan (2-4 steps) of what needs to be done to complete this task "
        "— e.g. what information needs to be looked up, what needs to be "
        "checked or verified. Keep it brief and concrete.\n\n"
        f"Task understanding: {state['understanding']}"
    )
    plan = _call_reasoning_model(prompt)
    return {
        "plan": plan,
        "steps_completed": state.get("steps_completed", []) + ["plan"],
    }


def retrieve_node(state: AgentState) -> dict:
    """
    Retrieves relevant private context from Qdrant, using the raw
    user question as the query — more predictable than embedding the
    model's restated understanding, which can drift (e.g. focusing on
    "no document was provided" rather than the actual question asked).
    """
    try:
        query_embedding = get_embedding(state["user_input"])
        raw_results = search(query_embedding, top_k=3)
        context = [r.payload["text"] for r in raw_results]
    except Exception as e:
        print(f"RETRIEVE_NODE ERROR: {type(e).__name__}: {e}")
        context = []

    return {
        "retrieved_context": context,
        "steps_completed": state.get("steps_completed", []) + ["retrieve"],
    }


def reason_node(state: AgentState) -> dict:
    """
    Produces the agent's analysis and recommendation, grounded in the
    document content and any retrieved context.
    """
    context_text = "\n".join(state.get("retrieved_context") or []) or "(no additional context retrieved)"
    prompt = (
        "Based on the task understanding, document content, and retrieved "
        "context below, provide a clear analysis and recommendation. "
        "If information is missing, say so explicitly rather than guessing.\n\n"
        f"Task understanding: {state['understanding']}\n\n"
        f"Document content: {state.get('document_text') or '(none provided)'}\n\n"
        f"Retrieved context: {context_text}"
    )
    reasoning_output = _call_reasoning_model(prompt)
    return {
        "reasoning_output": reasoning_output,
        "steps_completed": state.get("steps_completed", []) + ["reason"],
    }


def validate_node(state: AgentState) -> dict:
    """
    Checks the reasoning output against the retrieved context for
    obvious gaps — e.g. claims not supported by any retrieved source,
    or missing information the analysis itself flagged. Currently
    produces notes attached to the final deliverable rather than
    looping the graph back; a human reviewer makes the final call
    (per the project's human-in-the-loop requirement).
    """
    context_text = "\n".join(state.get("retrieved_context") or []) or "(no additional context retrieved)"
    prompt = (
        "Review the analysis below against the retrieved context it was "
        "based on. Briefly note: (1) whether the conclusion is properly "
        "grounded in the retrieved context or document, and (2) any gaps, "
        "unsupported claims, or missing information a human reviewer "
        "should double-check before approving this. Keep it to 2-3 sentences.\n\n"
        f"Analysis: {state['reasoning_output']}\n\n"
        f"Retrieved context it was based on: {context_text}"
    )
    validation_notes = _call_reasoning_model(prompt)
    return {
        "validation_notes": validation_notes,
        "steps_completed": state.get("steps_completed", []) + ["validate"],
    }


def generate_node(state: AgentState) -> dict:
    """
    Produces the final deliverable text, then generates a real DOCX
    approval note from it.
    """
    prompt = (
        "Write a formal approval note based on the analysis below. "
        "Structure it with a brief summary, key findings, and a clear "
        "recommendation. Include a short 'Reviewer Notes' section using "
        "the validation notes provided, so a human reviewer knows what "
        "to double-check. Use **bold** markdown for section headers.\n\n"
        f"Analysis: {state['reasoning_output']}\n\n"
        f"Validation notes: {state.get('validation_notes') or '(none)'}"
    )
    final_output = _call_reasoning_model(prompt)
    docx_path = generate_approval_note(final_output, title="SOVARA AI — Approval Note")
    return {
        "final_output": final_output,
        "docx_path": docx_path,
        "steps_completed": state.get("steps_completed", []) + ["generate"],
    }


def build_agent_graph():
    """Builds and compiles the SOVARA agent graph."""
    graph = StateGraph(AgentState)

    graph.add_node("understand", understand_node)
    graph.add_node("plan", plan_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("reason", reason_node)
    graph.add_node("validate", validate_node)
    graph.add_node("generate", generate_node)

    graph.set_entry_point("understand")
    graph.add_edge("understand", "plan")
    graph.add_edge("plan", "retrieve")
    graph.add_edge("retrieve", "reason")
    graph.add_edge("reason", "validate")
    graph.add_edge("validate", "generate")
    graph.add_edge("generate", END)

    return graph.compile()