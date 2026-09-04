// Pure Dev Resource submission helpers shared by the browser and Actions.
import { findDevResourceDuplicates, validateDevResourceSubmission } from "./dev-resources.js";

export { findDevResourceDuplicates, validateDevResourceSubmission };

export function devResourceIdFromName(value = "") {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function buildDevResourceCandidate({ name = "", category = "other", description = "", url = "", favicon = "", tags = [], tech = [], pricing = "", openSource = false, noSignup = false, copyable = false } = {}) {
  return {
    id: devResourceIdFromName(name), name: String(name).trim(), category, description: String(description).trim(),
    // Keep entered URLs intact until canonical validation runs. In particular,
    // an invalid non-empty optional favicon must not be normalized to an empty
    // value before the Manual form can show the contributor an error.
    url: String(url).trim(), favicon: String(favicon).trim(), tags, tech, pricing,
    openSource: openSource === true, noSignup: noSignup === true, copyable: copyable === true
  };
}

export function buildDevResourcePrompt(url = "", context = "") {
  const website = url || "(unknown)";
  const optionalContext = context || "(none)";
  return `You are creating ONE production-quality Dev Resource JSON record for the AI-Dekrov Dev Resources catalog.

OFFICIAL WEBSITE:
${website}

OPTIONAL CONTEXT:
${optionalContext}

Your job is to research the CURRENT official website and produce one factual, structured record describing the developer resource.

This catalog is NOT a general directory of websites developers happen to use.

A Dev Resource qualifies only when its primary purpose is to provide a concrete reusable resource, development utility, generator, asset, snippet, component, template, testing tool, data tool, or direct solution to a programming/development task.

Examples that qualify:
- UI component libraries
- ready-made templates
- CSS effects
- animation libraries
- icon/SVG resources
- color/font/design utilities
- code generators
- reusable code snippets
- API testing tools
- mock API tools
- JSON/data utilities
- regex/encoding/conversion utilities
- web-development utilities

A site does NOT qualify merely because programmers use it.

For example:
- general social networks
- generic cloud storage
- general project management software
- GitHub merely because developers use GitHub

would not automatically belong in Dev Resources.

AI CLASSIFICATION RULE:

Classify by PRIMARY PURPOSE.

If the primary product is:
- an AI coding agent
- AI app builder
- prompt-driven AI website generator
- AI development assistant

then it belongs in AI Tools, NOT Dev Resources.

If the primary product is:
- a component library
- code/snippet resource
- generator
- dev utility
- design resource
- API/testing utility

and it merely includes optional AI functionality, it can remain a Dev Resource.

Do not classify something as an AI Tool merely because it has an AI feature.

RESEARCH RULES:

1. Prefer the official/current website.
2. Inspect relevant official pages when available, such as:
   - homepage
   - documentation
   - pricing
   - GitHub repository
   - about/features pages
3. Do not rely on old articles or outdated product descriptions when current official information is available.
4. Do not invent information.
5. When a fact cannot be verified, use the appropriate empty value.
6. Marketing claims should be rewritten as neutral factual descriptions.

ALLOWED CATEGORIES:

ui-components
templates
css
animations
icons-svg
design-resources
generators
snippets
api-tools
data-json
developer-utilities
web-utilities
other

CATEGORY GUIDANCE:

ui-components
Reusable UI elements, component galleries, component libraries.

templates
Website/app/project templates, starter kits, boilerplates.

css
CSS utilities, effects, styling resources, gradients, shadows, layouts.

animations
Animations, transitions, loaders, animated UI resources.

icons-svg
Icons, SVG libraries, SVG assets and related tools.

design-resources
Colors, palettes, typography, fonts and developer-oriented design resources.

generators
Tools whose main purpose is generating code, configuration or development assets.

snippets
Reusable code snippets and small ready-made code solutions.

api-tools
API testing, HTTP tools, mock APIs, request inspection and related utilities.

data-json
JSON, structured-data, formatting, transformation and inspection tools.

developer-utilities
General programming utilities that do not fit a more specific category.

web-utilities
Utilities specifically useful for web-development tasks.

other
Use only when the resource clearly belongs in Dev Resources but no specific category fits.

OUTPUT SCHEMA:

Return exactly ONE JSON object with exactly these fields:

{
  "id": "",
  "name": "",
  "category": "",
  "description": "",
  "url": "",
  "favicon": "",
  "tags": [],
  "tech": [],
  "pricing": "",
  "openSource": false,
  "noSignup": false,
  "copyable": false
}

FIELD RULES:

id:
- lowercase kebab-case
- stable and based on the canonical resource/product name
- maximum 80 characters

name:
- current canonical product/resource name
- no slogans or marketing taglines

category:
- exactly one allowed category

description:
- concise factual explanation of what the resource provides
- useful to a developer deciding why they would use it
- no marketing filler
- maximum 500 characters

url:
- canonical official HTTP(S) website
- remove tracking parameters

favicon:
- official HTTP(S) favicon/logo URL only when confidently identifiable
- otherwise ""

tags:
- short factual discovery tags
- no duplicate tags
- maximum 20

tech:
- technologies directly relevant to the resource
- examples: CSS, React, Vue, Tailwind CSS, JavaScript
- include only when verified
- otherwise []

pricing:
exactly one of:
- "free"
- "freemium"
- "paid"
- ""

Use "" when pricing cannot be confidently verified.

openSource:
true only when the resource itself is verifiably open source.
A public GitHub repository alone is not enough if it does not represent the actual resource.

noSignup:
true only when the core useful functionality can actually be used without creating an account.

copyable:
true when the resource directly provides code/config/assets intended to be copied or reused by developers.

UNKNOWN VALUES:

Use:
- "" for unknown strings
- [] for unknown arrays
- false for unverified boolean claims

Never use:
- null
- "unknown"
- placeholder text
- invented values

IMPORTANT:

Do NOT include:
- domain
- addedAt
- sources
- notes
- AI Tool fields
- any extra keys

addedAt is owned by the approval workflow.

Before answering, verify:

1. The website actually qualifies as a Dev Resource.
2. The primary purpose is correctly classified.
3. The category is allowed.
4. Every factual claim is supported by current official information.
5. Unknown information was not guessed.
6. The JSON contains exactly the allowed keys.
7. The output is valid JSON.

OUTPUT:

Return ONLY the JSON object.

No Markdown.
No code fence.
No explanation before or after it.`;
}

export function buildDevResourceSubmissionBody(resource, context = "") {
  return ["### Submission kind", "dev-resource", "", "### Submission type", "new", "", "### Dev Resource JSON", JSON.stringify(resource, null, 2), "", "### Context", context || "_No response_", "", "### Confirmation", "- [x] I confirm this is a factual public developer resource."].join("\n");
}
