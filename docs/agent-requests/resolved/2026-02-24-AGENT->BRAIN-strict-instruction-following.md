# Request from AGENT to BRAIN: Strict Instruction Following for Text Modification

## Context
When a user instructs the AI agent to edit specific parts of formatting or content—such as "제목만 바꾸라고 해" (Just change the title)—the agent sometimes acts overly enthusiastically and modifies the text inside the body of the paragraph as well. 
This causes a disconnect between the user's explicit command and the system's execution, leading to poor user experience.

## Details of Issue
- **Source**: USER feedback during document preview testing.
- **Problem**: The LLM hallucinates or excessively iterates on the document content when prompted to only modify formatting or a specific element (like the title). It ends up modifying body text without authorization.

## Request for Brain Component (`windows-brain`)
Please update the agent's system prompt or code generation mechanism:
1. **Enforce strict locality**: If the user asks to modify a specific area (e.g. title), explicitly constrain the reasoning engine from touching `runs` in unrelated `paragraph` blocks.
2. **Prevent hallucination of edits**: Emphasize in the prompt that it should act as a precise structural editor, NEVER rewriting text under the guise of "formatting" unless explicitly commanded to paraphrase or rewrite. 
3. Any LLM instructions in the prompt pipeline should be reviewed to prioritize strict text-preservation by default unless a "diff" actually necessitates a text change.
