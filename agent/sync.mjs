// Creează sau actualizează agentul ElevenLabs din apelul live de pe site.
//   ELEVENLABS_API_KEY=sk_… node agent/sync.mjs --voice-from=<agent_id>   (sau --voice=<voice_id>)
// Prima rulare creează unealta și agentul și scrie id-urile în agent/agent.json; următoarele le actualizează.
// După creare, id-ul agentului se pune în AGENT.id din assets/site.js.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.elevenlabs.io/v1/convai';
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const key = process.env.ELEVENLABS_API_KEY;
const arg = (name) => (process.argv.find((a) => a.startsWith('--' + name + '=')) || '').split('=')[1];

const statePath = here('./agent.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};

// Prețurile pentru testele din dashboard vin din aceeași listă ca pe site (SERVICES din site.js).
const siteJs = readFileSync(here('../assets/site.js'), 'utf8');
const SERVICES = Function('return ' + siteJs.match(/var SERVICES = (\[[\s\S]*?\n  \]);/)[1])();
const preturi = SERVICES.map((s) => s.flat
  ? `${s.name}: ${s.flat} lei, preț fix. ${s.desc}`
  : `${s.name}: ${s.base} lei plus ${s.perM3} lei pe metru cub. ${s.desc}`).join('\n');

async function call(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

const tool = {
  tool_config: {
    type: 'client',
    name: 'arata_comanda',
    description: 'Arată pe harta de pe site comanda confirmată. Se folosește o singură dată, imediat după ce omul confirmă programarea.',
    expects_response: false,
    parameters: {
      type: 'object',
      required: ['serviciu', 'pret_lei', 'ora', 'adresa'],
      properties: {
        serviciu: { type: 'string', description: 'Numele serviciului, exact ca în lista de prețuri.' },
        metri_cubi: { type: 'number', description: 'Metrii cubi vidanjați; zero la desfundare.' },
        pret_lei: { type: 'number', description: 'Prețul spus omului, în lei.' },
        ora: { type: 'string', description: '„acum” sau ora stabilită, cu cifre, de exemplu „10:30”.' },
        adresa: { type: 'string', description: 'Strada și numărul, cu cifre, pe scurt, de exemplu „Str. Florilor 12, Ploiești”.' },
      },
    },
  },
};

const agent = (toolId, voiceId) => ({
  name: 'EuroVid — apelul de pe site (demo)',
  conversation_config: {
    agent: {
      first_message: 'Bună ziua, EuroVid aici. Cu ce vă pot ajuta?',
      language: 'ro',
      dynamic_variables: {
        dynamic_variable_placeholders: { preturi, acum: 'luni, 26 octombrie, ora 10:00', sofer: 'Ion', minute_sosire: 7 },
      },
      prompt: {
        prompt: readFileSync(here('./prompt.md'), 'utf8'),
        llm: 'gemini-2.5-flash',
        thinking_budget: 0,          // cu gândirea pornită scurge engleză în vorbire și adaugă ~600 ms (lecția din FieldOps)
        temperature: 0.3,
        ignore_default_personality: true,
        tool_ids: [toolId],
        built_in_tools: { end_call: { name: 'end_call', description: '', params: { system_tool_type: 'end_call' } } },
      },
    },
    tts: { voice_id: voiceId, model_id: 'eleven_flash_v2_5', expressive_mode: false }, // expresivul scurge etichete „[sad]”
    turn: { turn_timeout: 2, turn_eagerness: 'eager', speculative_turn: true, retranscribe_on_turn_timeout: true },
    conversation: { max_duration_seconds: 180 },
  },
  platform_settings: {
    // agent public (site static, fără server), dar pornește doar de pe domeniile noastre
    auth: {
      enable_auth: false,
      allowlist: ['lfenomenal.github.io', 'eurovid.eu', 'www.eurovid.eu', 'localhost'].map((hostname) => ({ hostname })),
    },
    privacy: { record_voice: false, retention_days: 30 },
    call_limits: { daily_limit: 100 },
  },
});

async function main() {
  if (!key) throw new Error('Lipsește ELEVENLABS_API_KEY.');
  // --voice-from=<agent_id> ia vocea unui agent existent (de ex. „Maria" de la agentul telefonic FieldOps)
  const voiceFrom = arg('voice-from');
  const voiceId = arg('voice')
    || (voiceFrom && (await call('GET', '/agents/' + voiceFrom)).conversation_config.tts.voice_id)
    || state.voiceId;
  if (!voiceId) throw new Error('Lipsește vocea: --voice=<voice_id> sau --voice-from=<agent_id>.');

  if (state.toolId) await call('PATCH', '/tools/' + state.toolId, tool);
  else state.toolId = (await call('POST', '/tools', tool)).id;

  if (state.agentId) await call('PATCH', '/agents/' + state.agentId, agent(state.toolId, voiceId));
  else state.agentId = (await call('POST', '/agents/create', agent(state.toolId, voiceId))).agent_id;

  state.voiceId = voiceId;
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
  console.log('Gata. Agent:', state.agentId, '· unealta:', state.toolId);
}

main().catch((e) => {
  // id-urile create înainte de eroare rămân salvate, ca rularea următoare să le actualizeze, nu să le dubleze
  if (state.toolId) writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
  console.error(e.message);
  process.exitCode = 1;
});
