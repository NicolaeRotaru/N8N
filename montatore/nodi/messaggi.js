// Un elemento per messaggio Telegram (i messaggi lunghi sono già spezzati sotto i 3.800 caratteri).
const x = $input.first().json || {};
const lista = Array.isArray(x.messaggi) ? x.messaggi : [x.messaggio];
return lista.filter(Boolean).map((messaggio) => ({ json: { messaggio } }));
