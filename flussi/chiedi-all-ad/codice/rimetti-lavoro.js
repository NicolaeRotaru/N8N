// Chiedi all'AD · Rimetti il lavoro
// Dopo «Salva gli allegati» si riprende il lavoro preparato e si dice se TUTTE le righe sono davvero nella tabella.
// Il nodo Data table manda sull'uscita di errore solo alcuni errori: altri (tabella piena, una colonna che manca, il
// database) escono sull'uscita buona con gli elementi di prima, senza l'id della riga. Quindi si contano solo le righe
// con un id: se ne manca anche una, «Salvate tutte?» porta ad «Allegati non salvati» e la routine non parte.
const prep = $('Prepara il lavoro').first();
const attese = (prep.json.righe || []).length;
const entrate = $input.all().filter((i) => i && i.json && (typeof i.json.id === 'number' || (typeof i.json.id === 'string' && i.json.id !== '')) && !i.json.error).length;
const salvate_tutte = attese > 0 && entrate >= attese;
const motivo = salvate_tutte ? '' : `la tabella ha preso ${entrate} righe su ${attese}`;
return [{ json: { ...prep.json, salvate_tutte, ...(motivo ? { motivo_salvataggio: motivo } : {}) } }];
