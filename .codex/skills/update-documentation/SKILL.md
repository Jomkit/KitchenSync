---
name: update-documentation
description:
  Perform structured Markdown documentation edits across repository docs such as AGENTS.md, README.md, CONTRIBUTING.md, and docs/*.md. Use when a request asks to add, remove, replace, or reorganize specific sections, rules,examples, or headings while preserving Markdown structure and consistency.
---

# Update Documentation

Execute targeted Markdown updates with minimal scope, deterministic formatting,
and structured JSON responses.

## Inputs

The skill expects the following structured inputs:

- **doc_path** *(string)* — relative path to the target Markdown document
- **section_identifier** *(string)* — heading text or unique marker that
  identifies the target area within the document
- **operation** *(string)* — one of: `"add"`, `"replace"`, `"remove"`
- **content** *(string)* — text to insert or replace (ignored for `"remove"`)
- **format_spec** *(string)* — expected document type (`"markdown"`)

## Workflow

1. **Verify File Existence**
   - Confirm that `doc_path` exists.
   - If the file is not found, return:
     ```json
     {"status":"error","error_code":"DocNotFound","message":"File not found: <doc_path>"}
     ```

2. **Read & Parse Document**
   - Load the file content as text.
   - Parse content into a Markdown structure tree (headings and subtrees).
   - If parse fails, return:
     ```json
     {"status":"error","error_code":"ParseError","message":"Unable to parse document"}
     ```

3. **Locate Target Section**
   - Find the section matching `section_identifier` in headings.
   - If no heading matches, return:
     ```json
     {"status":"error","error_code":"SectionNotFound","message":"Section not found"}
     ```

4. **Perform the Operation**
   - **`"add"`**: Insert `content` immediately after the heading line.
   - **`"replace"`**: Replace everything under the section until the next
     same-level heading with `content`.
   - **`"remove"`**: Remove the identified heading and all its content
     up to the next heading of equal or higher level.

5. **Preserve Formatting**
   - Maintain Markdown list bullets and heading indentation.
   - Do not rewrite unrelated parts of the document.

6. **Write Updated File**
   - Save the modified content back to `doc_path`.

7. **Return Structured Success**
   - Always return a JSON object like:
     ```json
     {
       "doc_path":"<doc_path>",
       "operation":"<operation>",
       "section":"<section_identifier>",
       "status":"success",
       "summary":"<brief description of the change>"
     }
     ```

## Editing Rules

- Keep edits limited to the requested section only.
- Preserve surrounding Markdown conventions and list/heading styling.
- If the request asks for conflicting changes, follow the instruction that
  best matches the user’s explicit wording.

## Common Use Cases

Codex should trigger this skill when the user’s request clearly
matches one of these patterns:

- “Add a rule under a specific Markdown heading.”
- “Replace an outdated example under a known section.”
- “Remove a deprecated section from a Markdown document.”
- “Insert a subsection into project documentation.”

## Verification Checklist

After edits, ensure:

- The intended section exists and reflects the requested change.
- Removed content is fully deleted for `"remove"` operations.
- Headings and lists still render correctly.
- No unrelated sections were modified.

## Example Inputs & Outputs

### Example: Add

**Input:**
```json
{
  "doc_path":"AGENTS.md",
  "section_identifier":"## Style Guidelines",
  "operation":"add",
  "content":"- Enforce formatter on commit",
  "format_spec":"markdown"
}
