"""
SOVARA AI — Agent State

Defines the shared state that flows through every node of the LangGraph
agent. Each node reads from this state and returns updates to it —
this is how information passes from Understand -> Retrieve -> Reason -> Generate.
"""

from typing import TypedDict, Optional


class AgentState(TypedDict):
    # Input: the raw task/question from the user, plus any document text
    # extracted earlier (e.g. from OCR/vision).
    user_input: str
    document_text: Optional[str]

    # Set by the Understand node: a clarified restatement of what the
    # user actually needs, used to guide retrieval and reasoning.
    understanding: Optional[str]

    # Set by the Retrieve node: relevant context pulled from private
    # knowledge (RAG). Empty list if no retrieval was needed/available.
    retrieved_context: Optional[list]

    # Set by the Reason node: the agent's analysis and recommendation,
    # grounded in document_text and retrieved_context.
    reasoning_output: Optional[str]

    # Set by the Generate node: the final deliverable text, ready to be
    # turned into a DOCX approval note.
    final_output: Optional[str]

    # Set by the Generate node: file path of the generated DOCX approval note.
    docx_path: Optional[str]

    # Simple trace of which nodes have run, useful for debugging and
    # later for showing live agent progress in the UI.
    steps_completed: list
