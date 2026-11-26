// 14c · Venditori della scheda · Componi l'elenco
// Le ultime schede del venditore (senza i testi: solo cosa serve per riaprirle).
const voci = $input.all().map((i) => (i && i.json) || {}).filter((r) => r.lavoro);
return [{ json: { schede: voci.slice(0, 20).map((r) => ({ lavoro: r.lavoro, nome: r.nome || 'Scheda', stato: r.stato || 'in_corso', iniziato: Number(r.iniziato) || null })) } }];
