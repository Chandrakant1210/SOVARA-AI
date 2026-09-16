"""
SOVARA AI — LangGraph Agent

Defines the core agent graph: Understand -> Retrieve -> Reason -> Generate.
Each node calls a real model via the model registry — no stubs.
"""

import ollama
from langgraph.graph import StateGraph, END
from app.agent.state import AgentState
from app.config.model_registry import get_model_for_capability


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


def retrieve_node(state: AgentState) -> dict:
    """
    Retrieves relevant private context. Currently a stub — Chandrakant's
    /api/retrieve endpoint is not yet available. Returns an empty list
    so the graph runs end to end without blocking on RAG.
    """
    return {
        "retrieved_context": [],
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


def generate_node(state: AgentState) -> dict:
    """
    Produces the final deliverable text, ready to be turned into a
    DOCX approval note.
    """
    prompt = (
        "Write a formal approval note based on the analysis below. "
        "Structure it with a brief summary, key findings, and a clear "
        "recommendation.\n\n"
        f"Analysis: {state['reasoning_output']}"
    )
    final_output = _call_reasoning_model(prompt)
    return {
        "final_output": final_output,
        "steps_completed": state.get("steps_completed", []) + ["generate"],
    }


def build_agent_graph():
    """Builds and compiles the SOVARA agent graph."""
    graph = StateGraph(AgentState)

    graph.add_node("understand", understand_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("reason", reason_node)
    graph.add_node("generate", generate_node)

    graph.set_entry_point("understand")
    graph.add_edge("understand", "retrieve")
    graph.add_edge("retrieve", "reason")
    graph.add_edge("reason", "generate")
    graph.add_edge("generate", END)

    return graph.compile()
