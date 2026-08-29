# AI-Dekrov

Мой склад AI-инструментов.

Полное описание функций сайта: [`FEATURES.md`](FEATURES.md).

## Run locally

The catalog loads `data/tools.json`, so it needs a tiny local web server instead of opening `index.html` directly as a `file://` URL.

With Python:

```bash
python -m http.server 8080
```

Then open <http://localhost:8080>.

With Node.js:

```bash
npx serve .
```

## Публичный каталог и предложения

`data/tools.json` — canonical public database. Только изменения, попавшие в репозиторий и смерженные в основную ветку, появляются одинаково для всех посетителей.

Кнопка «Предложить инструмент» открывает три режима подготовки submission:

- **Quick Add** — вставь URL. Сайт надёжно подставит URL, домен, favicon и предложит имя из домена, затем откроет ручной редактор.
- **Manual** — полная ручная форма.
- **JSON Import** — встроенный AI Prompt Builder. Вставь URL и при желании контекст, скопируй готовый prompt в любую внешнюю AI-модель, затем вставь её JSON-ответ обратно. Сайт форматирует JSON, показывает ошибки и human-readable preview; перед добавлением можно перейти в Manual и поправить поля.

После preview сайт копирует JSON и открывает официальную GitHub Issue Form. Для отправки нужен GitHub account. Предложение проходит автоматическую проверку и модерацию; оно не появляется на сайте сразу.

Полный процесс для участника, owner и модератора описан в [`CONTRIBUTING.md`](CONTRIBUTING.md) и [`MODERATION.md`](MODERATION.md).

Статический сайт на GitHub Pages не может безопасно читать произвольные внешние страницы из браузера: это ограничено CORS. Для полноценного импорта метаданных используй локальную Node.js-команду:

```bash
npm run add-tool -- https://example.com
```

Если PowerShell блокирует `npm.ps1`, используй эквивалентную команду `npm.cmd run add-tool -- https://example.com`.

Скрипт скачивает страницу локально, извлекает доступные metadata, favicon, GitHub/docs-ссылки, платформы, команды и теги. Перед сохранением он покажет JSON и попросит уточнить категорию и цену. Ничего не добавляется без подтверждения.

`data/tools.json` можно также редактировать вручную, если нужны записи, общие для репозитория.

Схема AI-ответа, enum-значения и проверка находятся в [`data/tool-schema.json`](data/tool-schema.json). Prompt генерируется из этого файла, поэтому структура не дублируется вручную.

Open [`data/tools.json`](data/tools.json) and add one object to the array. The important fields are:

```json
{
  "id": "unique-slug",
  "name": "Название инструмента",
  "category": "coding-agents",
  "description": "Короткое описание.",
  "url": "https://example.com",
  "domain": "example.com",
  "favicon": "https://example.com/favicon.ico",
  "platforms": ["web", "cli"],
  "pricing": "free",
  "tags": ["coding"],
  "install": "",
  "start": "",
  "commands": [],
  "notes": "",
  "models": [],
  "github": "",
  "docs": "",
  "addedAt": "2026-08-29",
  "updatedAt": "2026-08-29",
  "lastVerifiedAt": "",
  "sources": ["https://example.com"]
}
```

Цена может быть: `free`, `mid` или `expensive`. Если цена неизвестна, оставь поле пустым.

Commands with labels can be added like this:

```json
"commands": [
  { "label": "Login", "command": "tool login" }
]
```

## GitHub Pages

This is a static site with no build step or backend. Publish the repository root with GitHub Pages. Hash routes such as `#/tools/codex/` work on GitHub Pages without server-side rewrite configuration.

Инструменты из сайта не сохраняются в `localStorage`. Он используется только для избранного, темы, UI-предпочтений и незавершённых черновиков. Публичные данные всегда берутся из `data/tools.json` репозитория.
