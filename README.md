<h1 align="center">interpres</h1>
<p align="center">Translate words with context, not just literally.</p>

<p align="center">
  <img src="./icons/icon128.png" alt="interpres logo"/>
</p>

`interpres` is a small Chrome extension that helps you translate selected text on any page and immediately see how the word or phrase works in real sentences.

Instead of showing only a flat dictionary-like translation, it also gives you:

- the direct translation
- detected source language
- 3 short example sentences with the selected word or phrase
- translation of each example sentence
- a simple explanation in the language you choose

## Why this is useful

Direct translation is often not enough.

A word can look simple, but still mean different things depending on tone, context, grammar, or the sentence around it. If you only read the raw translation, it is easy to misunderstand how the word is actually used.

That is why `interpres` shows context examples right away.

It helps when you want to:

- learn vocabulary while browsing
- understand phrases that do not translate literally
- see how a word sounds in real usage
- remember meaning faster because you saw it in context, not isolation

<img src="https://i.imgur.com/AKHyfin.png" width="500"/>

## How it works

1. You select text on a webpage.
2. Right click.
3. Choose `Translate and explain`.
4. The extension sends the text to your local backend.
5. The backend calls OpenAI through the Responses API.
6. The result comes back as a compact popup next to the selected text.

<img src="https://i.imgur.com/KcGSwhh.jpeg" width="500"/>

Important: the OpenAI API key is **not** stored in the extension. It stays only in the backend on your machine.

## What you need

Before starting, make sure you have:

- Google Chrome
- Node.js and npm
- an OpenAI API key

## Where to get an OpenAI API key

You can create one in the OpenAI dashboard:

- API keys page: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- official quickstart: [OpenAI Developer Quickstart](https://platform.openai.com/docs/quickstart/step-2-setup-your-api-key)

OpenAI’s quickstart also explains exporting the key as `OPENAI_API_KEY`. Source: [OpenAI quickstart](https://platform.openai.com/docs/quickstart/step-2-setup-your-api-key).

## Project structure

```text
interpres/
├── manifest.json
├── content.js
├── content.css
├── background.js
├── options.html
├── options.js
├── popup.html
├── popup.js
├── settings.css
├── settings-shared.js
├── server.js
├── package.json
├── pic.png
└── icons/
```

## Setup from scratch

### 1. Download or clone the project

If you already have the folder locally, skip this.

```bash
git clone https://github.com/dezhavyu/interpres
```

### 2. Install backend dependencies

```bash
npm install
```

### 3. Create your local `.env`

Create a file called `.env` in the project root.

Example:

```env
OPENAI_API_KEY=your_real_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TIMEOUT_MS=20000
PORT=8787
```

Notes:

- `OPENAI_API_KEY` is your real key from OpenAI
- `PORT=8787` is the local backend port used by the extension
- `.env` is ignored by git, so your key should not be pushed to GitHub

### 4. Start the backend

```bash
npm start
```

If everything is fine, you should see:

```bash
Translation backend listening on http://localhost:8787
```

### 5. Load the extension into Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this project folder
5. Chrome will add the extension

### 6. Open extension settings

You now have 2 ways to change settings:

- click the extension icon in Chrome to open the small quick settings popup
- or open the full settings page from Chrome extensions / extension options

Choose:

- `Target language`
- `Explanation language`

### 7. Use the translator

1. Open any normal webpage
2. Select a word, phrase, or short sentence
3. Right click
4. Click `Translate and explain`

You should see the result popup near the selected text.

## First launch checklist

If it does not work immediately, check these things:

- backend is running on `http://localhost:8787`
- the extension was reloaded after your latest changes
- the webpage itself was refreshed after reloading the extension
- you are testing on a normal site, not `chrome://...`

## Notes

- the extension does not call OpenAI directly
- the API key stays on the backend side
- selected text longer than 300 characters is rejected on purpose
- the extension is designed for short text fragments, not full-page translation




## Why the sentence examples matter

If you translate only the selected word, you get the basic meaning.

If you also see it inside 3 short example sentences, you get:

- tone
- rhythm
- typical usage
- much better understanding of whether the translation actually fits

That usually makes the difference between “I translated it” and “I actually understood it”.
