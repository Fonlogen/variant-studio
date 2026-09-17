# Variant Studio

Skill per agenti AI (Claude Code, Codex, Gemini CLI, Cursor, Copilot CLI…) che crea **varianti di design di qualsiasi elemento** — un bottone, una card, un form, una sezione o una pagina intera — le mostra in una galleria live nel browser e ti fa scegliere, commentare o combinare. L'agente riceve la tua decisione in formato strutturato e continua da lì.

Ispirata al Visual Companion di [superpowers](https://github.com/obra/superpowers), riscritta da zero.

## Cosa fa in più rispetto al Visual Companion

| | Visual Companion | Variant Studio |
|---|---|---|
| Granularità | Soprattutto pagine/layout | Componenti, sezioni e pagine, con layout dedicati per ognuno |
| Storico | Mostra solo l'ultimo file | Round numerati, cronologia con "da #N", nulla viene sovrascritto |
| Viste | Una pagina | Griglia, affiancate, una alla volta, confronto a tendina (swipe) |
| Viewport | — | Adatta / mobile / tablet / laptop / desktop / larghezza personalizzata, zoom |
| Tema | — | Chiaro/scuro della variante + sfondo (grigio, bianco, scuro, trasparente) |
| Feedback | Click su un'opzione | Selezione multipla, 👍/👎, nota per variante, **commento su un singolo elemento** (con selettore CSS), nota generale |
| Azioni | — | Approva · Chiedi modifiche · Combina · Rifai tutto |
| Attesa | L'agente legge gli eventi al turno dopo | `wait` blocca finché non decidi (oppure lettura differita) |
| Live | Nuovo file = nuova schermata | Ricarica solo la variante modificata, placeholder mentre l'agente genera |
| Errori | — | Errori JS delle anteprime segnalati a te e all'agente |
| Stack reali | — | CSS del progetto via `/p/…`, Tailwind, varianti da URL (Storybook/dev server) |
| Piattaforme | Script bash | Un solo file Node senza dipendenze: macOS, Linux, Windows |
| Senza server | — | `build` crea una galleria HTML statica; la decisione va negli appunti |
| Lingua UI | Inglese | Italiano/inglese automatico |

## Installazione

Serve Node.js 18 o superiore. Copia la cartella `variant-studio` in:

- **Claude Code**: `~/.claude/skills/variant-studio/` (tutti i progetti) oppure `.claude/skills/variant-studio/` (solo un progetto). In alternativa, su claude.ai carica il file `.skill`.
- **Codex / Cursor**: `.agents/skills/variant-studio/` nel repository oppure `~/.agents/skills/variant-studio/`.
- **Gemini CLI**: `~/.gemini/skills/variant-studio/`.
- **Altri agenti**: incolla il contenuto di `agents-snippet.md` in `AGENTS.md` (o nel file di istruzioni dell'agente) correggendo il percorso.

Prova rapida dalla cartella di un progetto:

```bash
node ~/.claude/skills/variant-studio/scripts/studio.mjs start --project . --open
node ~/.claude/skills/variant-studio/scripts/studio.mjs demo --project .
```

## Come si usa

Chiedi all'agente, ad esempio:

- «Fammi 3 varianti della product card per la pagina categoria»
- «Proponimi alternative per il bottone "Aggiungi al carrello", con stati hover e disabilitato»
- «Mostrami due layout per il checkout, su mobile»

Nel browser: clicca la lettera (o premi 1–9) per selezionare, usa 👍/👎 e le note, premi **C** e clicca un elemento per commentarlo, poi invia con uno dei pulsanti in basso (o Ctrl/⌘+Invio).

Scorciatoie: `G` griglia · `S` affiancate · `F` una alla volta · `X` confronto · `C` commenta elemento · `D` chiaro/scuro · `←/→` nella vista singola · `Esc` esce dalla modalità commento.

## File creati nel progetto

Tutto finisce in `.variant-studio/` (aggiunto automaticamente al `.gitignore` se il progetto è un repository git):

```
.variant-studio/
  global.css            # (opzionale) token del tuo design system per tutti i round
  rounds/001-product-card/
    round.json          # domanda, tipo, etichette e note delle varianti
    a.html b.html c.html
    decision.json       # la tua scelta
  state/                # server.json, log, storico decisioni, errori
```

## Struttura della skill

```
variant-studio/
  SKILL.md                 istruzioni per l'agente
  agents-snippet.md        testo per AGENTS.md / GEMINI.md
  scripts/studio.mjs       CLI + server (zero dipendenze)
  scripts/ui/app.html      galleria
  scripts/ui/frame.js      script iniettato nelle anteprime
  scripts/ui/base.css      stile base dei frammenti
  references/              schema round.json, piattaforme, framework
  assets/demo-round/       round di esempio
```
