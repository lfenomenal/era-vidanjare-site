# Apelul de probă cu asistentul EuroVid

Când cineva apasă pe număr pe site, vorbește din browser, cu microfonul, cu un agent ElevenLabs
(contul gratuit). E simulare: agentul spune prețul și ora, dar nu pleacă nicio mașină.

- `prompt.md` — ce știe și cum vorbește agentul (doar vidanjare, „dumneavoastră", cifre rostite în cuvinte).
- `sync.mjs` — creează sau actualizează agentul în ElevenLabs din `prompt.md`.
- `agent.json` — id-urile agentului, al uneltei și al vocii (nu sunt secrete).

## Prețurile

Agentul nu are prețurile scrise în prompt. Site-ul i le trimite la fiecare apel din `SERVICES`
(`assets/site.js`) — aceeași listă care se vede pe pagină. Schimbi prețul acolo și agentul îl
spune din apelul următor.

## Pornire

```bash
ELEVENLABS_API_KEY=… node agent/sync.mjs --voice-from=agent_4901kv8trpsce8t8fxmcj3xx36bf
```

`--voice-from` ia vocea agentului telefonic din FieldOps („Maria - Natural UGC”). Pentru altă voce,
folosește `--voice=<voice_id>`.

Apoi pui id-ul agentului afișat în `AGENT.id` din `assets/site.js`. Cât `AGENT.id` e gol, numărul
duce la apelul înregistrat de pe pagină, ca înainte.

Pentru schimbări de prompt: editezi `prompt.md` și rulezi din nou scriptul, fără `--voice`.
Schimbările făcute direct în dashboard se pierd la următoarea rulare.

## Setări alese (și de ce)

| Setare | Valoare | De ce |
|---|---|---|
| LLM | Gemini 2.5 Flash, gândirea oprită | cu gândirea pornită scurgea engleză în vorbire și răspundea mai greu (măsurat pe FieldOps) |
| Voce | Flash v2.5, fără modul expresiv | modul expresiv scurge etichete gen „[sad]" în vorbire |
| Pauza după care răspunde | 2 s, „eager" | la 7 s (implicit) pare că agentul gândește 10 secunde |
| Durata maximă | 3 minute | creditele gratuite sunt puține |
| Apeluri pe zi | 100 | la fel |
| Domenii permise | lfenomenal.github.io, eurovid.eu, localhost | agentul e public (site static), dar pornește doar de pe paginile noastre |
| Înregistrarea vocii | oprită; transcrierile se șterg după 30 de zile | e apel de probă, oamenii pot spune adrese reale |

## Unealta `arata_comanda`

După ce omul confirmă, agentul o cheamă cu serviciul, metrii cubi, prețul, ora și adresa. Site-ul
pune comanda pe hartă și îl trimite pe Ion spre client, ca în apelul înregistrat.

## Când se termină creditele

Dacă agentul nu răspunde, butoanele trec singure pe apelul înregistrat, cu mesajul „Asistentul nu
e disponibil acum".
