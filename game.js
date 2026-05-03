// --- CONFIGURAÇÕES E VARIÁVEIS GLOBAIS ---
const cores = ['vermelho', 'azul', 'verde', 'amarelo'];
const valores = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'R', '+2'];
let baralho = [], maos = [], turnoAtual = 0, historicoDescarte = [];
let jogoAtivo = false, vsCPU = false, placar = [], nomes = [];
let podeInteragir = true, sentidoHorario = true;
let acumulado = 0;   // cartas acumuladas por +2/+4 encadeados
let tipoAtaque = null; // '+2' ou '+4' enquanto há acumulado ativo
let salaIdAtual = null, meuIndice = null;
let lobbyUnsubscribe = null; // guarda o listener do lobby para cancelar depois
let votouJogarNovamente = false; // controle de voto de revanche
let votosUnsubscribe = null;       // listener de votos de revanche
let heartbeatInterval = null;  // timer do heartbeat local
let presenceListeners = [];    // listeners de presence dos outros jogadores
let botTimeouts = {};          // timeouts de promoção de bot por índice


// ============================================================
// MÓDULO DE SOM — Web Audio API
// ============================================================
const SOM = (() => {
    let ctx = null;

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    // Utilitários
    function gain(ac, val, t = 0) {
        const g = ac.createGain();
        g.gain.setValueAtTime(val, t || ac.currentTime);
        return g;
    }

    function osc(ac, type, freq, start, end, vol = 0.3) {
        const o = ac.createOscillator();
        const g = gain(ac, vol);
        o.type = type;
        o.frequency.setValueAtTime(freq, start);
        g.gain.linearRampToValueAtTime(0, end);
        o.connect(g); g.connect(ac.destination);
        o.start(start); o.stop(end);
    }

    function sweep(ac, type, f0, f1, start, dur, vol = 0.25) {
        const o = ac.createOscillator();
        const g = gain(ac, vol);
        o.type = type;
        o.frequency.setValueAtTime(f0, start);
        o.frequency.linearRampToValueAtTime(f1, start + dur);
        g.gain.setValueAtTime(vol, start);
        g.gain.linearRampToValueAtTime(0, start + dur);
        o.connect(g); g.connect(ac.destination);
        o.start(start); o.stop(start + dur + 0.01);
    }

    function noise(ac, dur, vol = 0.15, filter = 1800) {
        const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource();
        src.buffer = buf;
        const f = ac.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = filter;
        f.Q.value = 0.8;
        const g = gain(ac, vol);
        g.gain.linearRampToValueAtTime(0, ac.currentTime + dur);
        src.connect(f); f.connect(g); g.connect(ac.destination);
        src.start(); src.stop(ac.currentTime + dur);
    }

    return {
        // Jogar carta: swipe futurista (sweep rápido para cima)
        jogarCarta() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                sweep(ac, 'sine', 300, 700, t, 0.12, 0.2);
                sweep(ac, 'sine', 600, 1100, t + 0.04, 0.1, 0.12);
                noise(ac, 0.08, 0.06, 2200);
            } catch(e) {}
        },

        // Comprar carta: clique suave + tom baixo
        comprarCarta() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                sweep(ac, 'sine', 220, 160, t, 0.15, 0.18);
                noise(ac, 0.06, 0.05, 800);
            } catch(e) {}
        },

        // Skip: tom cortado (dois bipes rápidos descendentes)
        skip() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                sweep(ac, 'square', 880, 440, t,       0.1, 0.15);
                sweep(ac, 'square', 660, 330, t + 0.12, 0.1, 0.12);
            } catch(e) {}
        },

        // Inverter: sweep circular (sobe e desce)
        inverter() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                sweep(ac, 'sine', 400, 900, t,       0.15, 0.2);
                sweep(ac, 'sine', 900, 400, t + 0.15, 0.15, 0.2);
            } catch(e) {}
        },

        // +2: dois pulsos de alerta
        mais2() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                sweep(ac, 'sawtooth', 300, 600, t,       0.1, 0.22);
                sweep(ac, 'sawtooth', 300, 600, t + 0.14, 0.1, 0.22);
            } catch(e) {}
        },

        // +4: quatro pulsos mais graves e intensos
        mais4() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                for (let i = 0; i < 4; i++) {
                    sweep(ac, 'sawtooth', 200, 500, t + i * 0.1, 0.08, 0.25);
                }
            } catch(e) {}
        },

        // Wild: acorde mágico com shimmer
        wild() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                [523, 659, 784, 1047].forEach((f, i) => {
                    sweep(ac, 'sine', f, f * 1.05, t + i * 0.05, 0.4, 0.15);
                });
                noise(ac, 0.3, 0.08, 3000);
            } catch(e) {}
        },

        // Vitória: fanfarra futurista
        vitoria() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                const notas = [523, 659, 784, 1047, 1319];
                notas.forEach((f, i) => {
                    sweep(ac, 'sine', f, f * 1.02, t + i * 0.1, 0.25, 0.3);
                });
                // pad de fundo
                sweep(ac, 'triangle', 262, 262, t, 0.8, 0.1);
                noise(ac, 0.5, 0.05, 4000);
            } catch(e) {}
        },

        // Embaralhando: ruído rítmico com varredura
        embaralhar() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                for (let i = 0; i < 6; i++) {
                    const st = t + i * 0.12;
                    noise(ac, 0.08, 0.12, 1200 + i * 150);
                    sweep(ac, 'sine', 200 + i * 30, 400 + i * 20, st, 0.08, 0.08);
                }
            } catch(e) {}
        },

        // Botão menu: clique leve
        botao() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                sweep(ac, 'sine', 600, 900, t, 0.06, 0.1);
            } catch(e) {}
        },

        // ONE: acorde impactante descendente
        one() {
            try {
                const ac = getCtx(), t = ac.currentTime;
                // nota principal grave
                sweep(ac, 'sine',     220, 180, t,       0.4, 0.35);
                // harmônico médio
                sweep(ac, 'triangle', 440, 360, t,       0.35, 0.25);
                // ataque inicial com ruído
                noise(ac, 0.06, 0.2, 2000);
                // shimmer agudo
                sweep(ac, 'sine', 1760, 880, t + 0.05, 0.3, 0.15);
            } catch(e) {}
        }
    };
})();

// --- INTERFACE E MENUS ---
function toggleModal(id, show) { 
    const el = document.getElementById(id);
    if(el) el.style.display = show ? 'flex' : 'none'; 
}

function abrirSetup(modo) {
    document.getElementById('container-principal').style.display = 'none';
    document.getElementById('setup-nomes').style.display = 'block';
    vsCPU = (modo === true);

    const camposLocais = document.getElementById('campos-locais');
    const camposOnline = document.getElementById('campos-online');
    const inputNomeJ2 = document.getElementById('nome-j2');

    if (modo === 'online') {
        camposLocais.style.display = 'none';
        camposOnline.style.display = 'block';
    } else {
        camposLocais.style.display = 'block';
        camposOnline.style.display = 'none';
        inputNomeJ2.style.display = vsCPU ? 'none' : 'inline-block';
    }
}

function voltarAoMenu() { 
    document.getElementById('setup-nomes').style.display = 'none'; 
    document.getElementById('container-principal').style.display = 'block'; 
}

function prepararInicio() {
    const nomeInput = document.getElementById('nome-j1').value.toUpperCase();
    
    let j1 = nomeInput || "JOGADOR 1";
    
    if (vsCPU) {
        let nomeHumano = nomeInput || "VOCÊ"; 
        nomes = [nomeHumano, "ROBÔ ESQ", "ROBÔ CIMA", "ROBÔ DIR"];
        placar = [0, 0, 0, 0];
    } else {
        let j2 = document.getElementById('nome-j2').value.toUpperCase() || "JOGADOR 2";
        nomes = [j1, j2];
        placar = [0, 0];
    }
    
    document.getElementById('menu-inicial').style.display = 'none';
    document.getElementById('btn-sair-partida').style.display = 'flex';
    document.getElementById('tela-embaralhando').style.display = 'flex';
    
    SOM.embaralhar();
    setTimeout(() => {
        document.getElementById('tela-embaralhando').style.display = 'none';
        document.getElementById('mesa-visual').style.visibility = 'visible';
        reiniciarPartida();
        // Multiplayer local: mostra cortina no início para o primeiro jogador
        if (!vsCPU && !salaIdAtual) {
            document.getElementById('proximo-player-nome').innerText = nomes[0];
            toggleModal('cortina-privacidade', true);
        }
    }, 1200);
}

// --- LÓGICA DO BARALHO ---

function embaralhar(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function criarBaralho() {
    baralho = [];
    cores.forEach(cor => {
        valores.forEach(v => { 
            baralho.push({ cor, valor: v }); 
            if (v !== '0') baralho.push({ cor, valor: v }); 
        });
    });

    for (let i = 0; i < 4; i++) { 
        baralho.push({ cor: 'preto', valor: 'W' }); 
        baralho.push({ cor: 'preto', valor: '+4' }); 
    }

    baralho = embaralhar(baralho);
    console.log("Baralho criado e embaralhado com sucesso!");
}

function formatarSimb(v) { 
    if (v==='S') return '🚫'; 
    if (v==='R') return '🔄'; 
    if (v==='W') return '🌈'; 
    return v; 
}

function criarElementoCarta(c) {
    const val = formatarSimb(c.valor);
    const div = document.createElement('div');
    div.className = 'carta';

    // Cartas pretas (wild): gradiente diagonal em vez de cor sólida
    if (c.cor === 'preto') {
        div.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)';
    } else {
        // Cor sólida com leve gradiente para profundidade
        const corMap = {
            vermelho: 'linear-gradient(145deg, #ff6b6b 0%, #c0392b 100%)',
            azul:     'linear-gradient(145deg, #7b8cff 0%, #3a3adb 100%)',
            verde:    'linear-gradient(145deg, #6bcb77 0%, #2d8a3e 100%)',
            amarelo:  'linear-gradient(145deg, #ffd93d 0%, #d4900a 100%)'
        };
        div.style.background = corMap[c.cor] || `var(--${c.cor})`;
    }

    div.innerHTML = `
        <div class="canto">${val}</div>
        <div class="centro"><span>${val}</span></div>
        <div class="canto canto-baixo">${val}</div>
    `;
    return div;
}

// --- CONTROLE DE PARTIDA ---
function reiniciarPartida() {
    const btnLobby = document.getElementById('btn-voltar-lobby');
    if (btnLobby) btnLobby.style.display = 'none';
    const btnNova = document.getElementById('btn-jogar-novamente');
    if (btnNova) btnNova.innerText = 'JOGAR NOVAMENTE';
    criarBaralho();
    maos = nomes.map(() => baralho.splice(0, 7));
    let inicial = baralho.find(c => c.cor !== 'preto' && !isNaN(c.valor));
    baralho = baralho.filter(c => c !== inicial);
    historicoDescarte = [{ ...inicial, rot: 0, ox: 0, oy: 0 }];
    sentidoHorario = true; turnoAtual = 0; jogoAtivo = true; podeInteragir = true; acumulado = 0; tipoAtaque = null;
    renderizar();
}

function renderizar() {
    const container = document.getElementById('minha-mao');
    const areas = [null, document.getElementById('visual-op-esq'), document.getElementById('visual-op-topo'), document.getElementById('visual-op-dir')];
    const pilha = document.getElementById('pilha-descarte');
    const placarBox = document.getElementById('placar-dinamico');

    if(!container || !pilha) return;

    container.innerHTML = ''; pilha.innerHTML = '';
    areas.forEach(a => a && (a.innerHTML = ''));

    document.getElementById('sentido-indicador').innerText = sentidoHorario ? "Horário ↻" : "Anti-Horário ↺";
    if(nomes.length > 0) document.getElementById('indicador-jogador').innerText = nomes[turnoAtual];

    // Glow na área do jogador ativo
    const todasAreas = [
        document.getElementById('minha-mao'),
        document.getElementById('visual-op-esq'),
        document.getElementById('visual-op-topo'),
        document.getElementById('visual-op-dir')
    ];
    todasAreas.forEach(a => a && a.classList.remove('area-ativa'));

    // Descobre qual área visual corresponde ao turnoAtual
    let areaAtiva = null;
    if (salaIdAtual) {
        const n = nomes.length;
        if (turnoAtual === meuIndice) {
            areaAtiva = document.getElementById('minha-mao');
        } else {
            const slotsVis = n === 2 ? [2] : n === 3 ? [1, 3] : [1, 2, 3];
            const areaIds = [null, 'visual-op-esq', 'visual-op-topo', 'visual-op-dir'];
            let slotIdx = 0;
            for (let i = 0; i < n; i++) {
                const rel = (i - meuIndice + n) % n;
                if (rel === 0) continue;
                if (i === turnoAtual) {
                    areaAtiva = document.getElementById(areaIds[slotsVis[slotIdx]]);
                    break;
                }
                slotIdx++;
            }
        }
    } else if (vsCPU) {
        const mapaVSCPU = [
            document.getElementById('minha-mao'),
            document.getElementById('visual-op-esq'),
            document.getElementById('visual-op-topo'),
            document.getElementById('visual-op-dir')
        ];
        areaAtiva = mapaVSCPU[turnoAtual] || null;
    } else {
        // Multiplayer local: sempre destaca o painel inferior
        areaAtiva = document.getElementById('minha-mao');
    }
    if (areaAtiva) areaAtiva.classList.add('area-ativa');

    placarBox.innerHTML = nomes.map((n, i) => `
        <div class="placar-item" style="opacity: ${turnoAtual === i ? 1 : 0.5}">
            <div class="placar-valor">${placar[i] || 0}</div>
            <div class="placar-label">${n}</div>
        </div>
    `).join('');

    historicoDescarte.slice(-5).forEach((c, idx) => {
        const div = criarElementoCarta(c);
        div.classList.add('carta-na-pilha');
        div.style.transform = `translate(${c.ox}px, ${c.oy}px) rotate(${c.rot}deg)`;
        div.style.zIndex = idx;
        pilha.appendChild(div);
    });

    // Monta mapa de posição visual para o modo online:
    // Cada jogador enxerga o tabuleiro rotacionado para que ele fique sempre embaixo.
    // posicaoVisual[idx] → qual área DOM recebe as cartas do jogador idx
    //   null  = painel inferior (minha mão)
    //   1     = área esquerda
    //   2     = área topo
    //   3     = área direita
    let posicaoVisual;
    if (salaIdAtual) {
        const n = nomes.length;
        posicaoVisual = new Array(n);
        // slots visuais disponíveis conforme número de jogadores
        // 2J: [topo]   3J: [esq, dir]   4J: [esq, topo, dir]
        const slotsVis = n === 2 ? [2] : n === 3 ? [1, 3] : [1, 2, 3];
        let slotIdx = 0;
        for (let i = 0; i < n; i++) {
            const relativo = (i - meuIndice + n) % n;
            if (relativo === 0) {
                posicaoVisual[i] = null; // sou eu
            } else {
                posicaoVisual[i] = slotsVis[slotIdx++];
            }
        }
    }

    maos.forEach((mao, idx) => {
        let noPainelInferior = salaIdAtual ? (idx === meuIndice) : (vsCPU ? (idx === 0) : (idx === turnoAtual));

        if (noPainelInferior) {
            const topo = historicoDescarte[historicoDescarte.length - 1];
            mao.forEach((c, i) => {
                const div = criarElementoCarta(c);
                // Se há acumulado ativo, só pode encadear com a mesma carta de ataque
                const ehValida = tipoAtaque
                    ? (c.valor === tipoAtaque)
                    : (c.cor === 'preto' || c.cor === topo.cor || c.valor === topo.valor);
                const possoClicarAgora = salaIdAtual ? (turnoAtual === meuIndice) : (vsCPU ? (turnoAtual === 0) : true);

                if (podeInteragir && possoClicarAgora && ehValida) {
                    div.classList.add('brilho-ativo');
                    div.style.cursor = 'pointer';
                    div.onclick = () => jogar(i);
                } else {
                    div.classList.add('carta-apagada');
                }
                container.appendChild(div);
            });
        } else {
            let target;
            if (salaIdAtual) {
                target = areas[posicaoVisual[idx]];
            } else {
                target = (nomes.length === 4) ? areas[idx] : areas[2];
            }
            if (target) mao.forEach(() => {
                const back = document.createElement('div');
                back.className = 'carta-costas';
                target.appendChild(back);
            });
        }
    });
}

async function jogar(i) {
    try {
        if (!jogoAtivo) return;
        if (turnoAtual === 0 && !podeInteragir && !salaIdAtual) return; 

        podeInteragir = false;
        const c = maos[turnoAtual].splice(i, 1)[0];
        SOM.jogarCarta();
        // Dispara botão ONE ao descartar a penúltima carta
        // Para carta preta: aguarda escolha de cor antes de mostrar o botão
        if (salaIdAtual && turnoAtual === meuIndice && maos[meuIndice].length === 1) {
            if (c.cor !== 'preto') {
                verificarBotaoOne();
            }
            // Para carta preta, verificarBotaoOne é chamado dentro de escolherCor()
        }
        historicoDescarte.push({ 
            ...c, 
            rot: Math.random() * 20 - 10, 
            ox: Math.random() * 10 - 5, 
            oy: Math.random() * 10 - 5 
        });

        if (maos[turnoAtual].length === 0) {
            document.getElementById('vencedor-texto').innerText = `VITÓRIA DE ${nomes[turnoAtual]}!`;
            placar[turnoAtual]++;
            jogoAtivo = false;
            if (salaIdAtual) sincronizarComFirebaseVencedor(turnoAtual);
            SOM.vitoria();
            votouJogarNovamente = false;
            if (salaIdAtual) {
                // Mostra botão "Voltar ao Lobby" no modal de fim
                const btnLobby = document.getElementById('btn-voltar-lobby');
                if (btnLobby) btnLobby.style.display = 'block';
                // Marca sala como "fim" e reseta votos para sistema de revanche
                window.firestore.updateDoc(
                    window.firestore.doc(window.db, "salas", salaIdAtual),
                    { status: "fim", votosRevanche: 0 }
                ).then(() => sincronizarComFirebaseVencedor(turnoAtual));
            }
            toggleModal('modal-fim', true);
            return;
        }

        if (c.cor === 'preto') {
            // Se foi a última carta (vitória já tratada acima), não abre modal
            if (!vsCPU || (vsCPU && turnoAtual === 0)) {
                SOM.wild();
                toggleModal('modal-cor', true);
            } else {
                historicoDescarte[historicoDescarte.length - 1].cor = cores[Math.floor(Math.random() * 4)];
                c.valor === '+4' ? aplicarEfeitoMais4() : trocarTurno();
            }
        } else {
            if (c.valor === 'R') {
                SOM.inverter();
                if (nomes.length > 2) sentidoHorario = !sentidoHorario;
                nomes.length > 2 ? trocarTurno() : trocarTurno(true);
            }
            else if (c.valor === 'S') { SOM.skip(); trocarTurno(true); }
            else if (c.valor === '+2') {
                SOM.mais2();
                acumulado += 2;
                tipoAtaque = '+2';
                trocarTurno();
            }
            else trocarTurno();
        }
        
        // Sincroniza para carta não-preta (preta sincroniza em escolherCor)
        if (salaIdAtual && c.cor !== 'preto') {
            await sincronizarComFirebase();
        }

    } catch (erro) {
        console.error(erro);
        podeInteragir = true; 
    }
}

function aplicarEfeitoMais4() {
    SOM.mais4();
    acumulado += 4;
    tipoAtaque = '+4';
    trocarTurno();
}

window.escolherCor = async function(cor) {
    const ultimaCarta = historicoDescarte[historicoDescarte.length - 1];
    ultimaCarta.cor = cor;
    toggleModal('modal-cor', false);
    ultimaCarta.valor === '+4' ? aplicarEfeitoMais4() : trocarTurno();

    if (salaIdAtual) {
        await sincronizarComFirebase();
    } else {
        renderizar();
    }

    // Dispara ONE aqui se penúltima carta era preta (wild/+4)
    if (salaIdAtual && meuIndice != null && maos[meuIndice] && maos[meuIndice].length === 1) {
        verificarBotaoOne();
    }
};

function trocarTurno(pulou = false, turnoAnterior = turnoAtual) {
    turnoAtual = calcularProximo(pulou ? 2 : 1);

    // Se há acumulado e o novo jogador não tem a carta de ataque,
    // distribui as cartas para ele e passa a vez automaticamente
    if (acumulado > 0) {
        const temAtaque = maos[turnoAtual].some(c => c.valor === tipoAtaque);
        if (!temAtaque) {
            for (let j = 0; j < acumulado; j++) if (baralho.length) maos[turnoAtual].push(baralho.pop());
            acumulado = 0;
            tipoAtaque = null;
            renderizar();
            trocarTurno(false, turnoAtual);
            return;
        }
    }

    renderizar();

    if (vsCPU) {
        if (turnoAtual === 0) {
            podeInteragir = true; 
            renderizar(); 
        } else {
            podeInteragir = false;
            setTimeout(ia, 1200); 
        }
    } else if (jogoAtivo && !salaIdAtual) {
        podeInteragir = false;
        // Cortina só aparece se houve troca real de pessoa
        if (turnoAtual !== turnoAnterior) {
            document.getElementById('proximo-player-nome').innerText = nomes[turnoAtual];
            toggleModal('cortina-privacidade', true);
        } else {
            // Mesmo jogador (2J com Inverter): continua sem cortina
            podeInteragir = true;
            renderizar();
        }
    }
}

async function comprarCarta() {
    if (!jogoAtivo) return;
    if (salaIdAtual && turnoAtual !== meuIndice) return; 
    if (turnoAtual === 0 && !podeInteragir && !salaIdAtual) return;

    if (baralho.length === 0) {
        const topo = historicoDescarte.pop();
        baralho = historicoDescarte.map(c => ({ cor: c.cor, valor: c.valor }));
        baralho = embaralhar(baralho);
        historicoDescarte = [topo];
    }

    const nova = baralho.pop(); 
    if (!nova) return;
    maos[turnoAtual].push(nova);
    SOM.comprarCarta();
    renderizar();

    const topo = historicoDescarte[historicoDescarte.length-1];
    const podeJogar = (nova.cor === 'preto' || nova.cor === topo.cor || nova.valor === topo.valor);
    
    if (salaIdAtual) {
        if (!podeJogar || tipoAtaque) {
            // Não pode jogar: avança o turno localmente e sobe estado já com turno novo
            podeInteragir = false;

            // Se há acumulado, distribui antes de avançar
            if (acumulado > 0) {
                const temAtaque = maos[turnoAtual].some(c => c.valor === tipoAtaque);
                if (!temAtaque) {
                    for (let j = 0; j < acumulado; j++) if (baralho.length) maos[turnoAtual].push(baralho.pop());
                    acumulado = 0; tipoAtaque = null;
                }
            }

            turnoAtual = calcularProximo(1);
            podeInteragir = (turnoAtual === meuIndice);
            renderizar();
            await sincronizarComFirebase();
        } else {
            // Pode jogar a carta comprada: mantém o turno para o jogador decidir
            podeInteragir = true;
            renderizar();
            await sincronizarComFirebase();
        }
    } else {
        if (turnoAtual === 0 || !vsCPU) {
            if (!podeJogar) { podeInteragir = false; setTimeout(trocarTurno, 800); }
        } else {
            if (podeJogar) setTimeout(() => jogar(maos[turnoAtual].length-1), 800);
            else setTimeout(trocarTurno, 800);
        } 
        renderizar();
    }
}

function calcularProximo(passo) {
    if (nomes.length === 0) return 0; 
    const direcao = sentidoHorario ? 1 : -1;
    return (turnoAtual + (passo * direcao) + nomes.length) % nomes.length;
}

window.confirmarVez = function() {
    toggleModal('cortina-privacidade', false);
    podeInteragir = true;
    renderizar();
};

function ia() {
    if (!jogoAtivo || turnoAtual === 0) return;
    const topo = historicoDescarte[historicoDescarte.length-1];
    // Respeita acumulado: só pode encadear com a mesma carta de ataque
    const index = tipoAtaque
        ? maos[turnoAtual].findIndex(c => c.valor === tipoAtaque)
        : maos[turnoAtual].findIndex(c => c.cor === 'preto' || c.cor === topo.cor || c.valor === topo.valor);
    if (index !== -1) jogar(index);
    else comprarCarta();
}

// --- LOBBY ONLINE ---

// Pega o nome do campo online (novo campo #nome-online)
function getNomeOnline() {
    const el = document.getElementById('nome-online');
    return el ? el.value.trim().toUpperCase() || "PLAYER" : "PLAYER";
}

// Botão "CRIAR NOVA SALA" → abre lobby como criador
window.irParaCriarSala = async () => {
    const nomeU = getNomeOnline();
    if (!window.db) return alert("Firebase ainda carregando...");

    const idSala = Math.random().toString(36).substring(2, 6).toUpperCase();

    try {
        await window.firestore.setDoc(window.firestore.doc(window.db, "salas", idSala), {
            status: "aguardando",
            criador: nomeU,
            jogadores: [nomeU],
            turno: 0,
            sentido: true,
            placar: JSON.stringify([0, 0]),
            podeIniciar: false,
            criadoEm: new Date()
        });

        abrirLobby(idSala, true, nomeU);
    } catch (e) {
        console.error(e);
        alert("Erro ao criar sala.");
    }
};

// Botão "ENTRAR NA SALA" → valida e entra no lobby como convidado
window.irParaEntrarSala = async () => {
    const cod = document.getElementById('input-codigo-sala').value.trim().toUpperCase();
    const nomeU = getNomeOnline();

    if (!cod) return alert("Digite o código da sala!");

    try {
        const docRef = window.firestore.doc(window.db, "salas", cod);
        const snap = await window.firestore.getDoc(docRef);

        if (snap.exists() && snap.data().status === "aguardando") {
            const dados = snap.data();
            const jogadoresAtuais = dados.jogadores || [];

            if (jogadoresAtuais.length >= 4) {
                return alert("Sala cheia! Máximo de 4 jogadores.");
            }

            const novosJogadores = [...jogadoresAtuais, nomeU];
            const indice = novosJogadores.length - 1;

            await window.firestore.updateDoc(docRef, {
                jogadores: novosJogadores
            });

            abrirLobby(cod, false, nomeU, indice);
        } else {
            alert("Sala não encontrada ou já em jogo.");
        }
    } catch (e) {
        console.error(e);
        alert("Erro ao entrar na sala.");
    }
};

// Abre a tela de lobby e começa a ouvir atualizações
function abrirLobby(idSala, souCriador, meuNome, indice) {
    salaIdAtual = idSala;
    meuIndice = souCriador ? 0 : indice;

    // Cancela listener de votos antigo se existir
    if (votosUnsubscribe) { votosUnsubscribe(); votosUnsubscribe = null; }
    // Cancela lobby listener anterior se existir
    if (lobbyUnsubscribe) { lobbyUnsubscribe(); lobbyUnsubscribe = null; }

    // Esconde o menu, mostra o lobby
    document.getElementById('menu-inicial').style.display = 'none';
    document.getElementById('tela-lobby').style.display = 'flex';
    document.getElementById('lobby-codigo-valor').innerText = idSala;

    // Ouve o documento da sala em tempo real
    lobbyUnsubscribe = window.firestore.onSnapshot(
        window.firestore.doc(window.db, "salas", idSala),
        (doc) => {
            const dados = doc.data();
            if (!dados) return;

            const jogadores = dados.jogadores || [];
            atualizarUILobby(jogadores, meuNome, souCriador);

            // Se o criador clicou em "INICIAR JOGO" → todos os convidados entram
            if (dados.status === "jogando" && !souCriador) {
                if (lobbyUnsubscribe) { lobbyUnsubscribe(); lobbyUnsubscribe = null; }
                document.getElementById('tela-lobby').style.display = 'none';
                jogoAtivo = false; // garante que ouvirMudancasOnline vai carregar o estado
                iniciarJogoOnline(idSala, false);
            }
        }
    );
}

// Atualiza a lista de jogadores e o botão de iniciar no lobby
function atualizarUILobby(jogadores, meuNome, souCriador) {
    const count = jogadores.length;
    document.getElementById('lobby-count').innerText = count;

    const lista = document.getElementById('lobby-lista-jogadores');
    lista.innerHTML = '';

    for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        if (jogadores[i]) {
            const ehEu = jogadores[i] === meuNome;
            slot.className = `lobby-slot ${ehEu ? 'eu' : 'ocupado'}`;
            slot.innerText = jogadores[i] + (ehEu ? ' (você)' : '');
        } else {
            slot.className = 'lobby-slot vazio';
            slot.innerText = 'Aguardando...';
        }
        lista.appendChild(slot);
    }

    const statusEl = document.getElementById('lobby-status-msg');
    const btnIniciar = document.getElementById('btn-iniciar-lobby');

    if (count >= 4) {
        statusEl.innerText = '✅ Sala cheia! Pronto para jogar.';
        statusEl.classList.add('pronto');
    } else if (count >= 2) {
        statusEl.innerText = `✅ ${count} jogadores prontos. Pode iniciar ou aguardar mais.`;
        statusEl.classList.add('pronto');
    } else {
        statusEl.innerText = '⏳ Aguardando ao menos mais um jogador...';
        statusEl.classList.remove('pronto');
    }

    if (souCriador) {
        const podeIniciar = count >= 2;
        btnIniciar.style.opacity = podeIniciar ? '1' : '0.4';
        btnIniciar.style.pointerEvents = podeIniciar ? 'auto' : 'none';
    }
}

// Criador clica em "INICIAR JOGO" no lobby
window.iniciarDoLobby = async () => {
    if (!salaIdAtual) return;

    // Para de ouvir o lobby
    if (lobbyUnsubscribe) { lobbyUnsubscribe(); lobbyUnsubscribe = null; }

    // Busca os nomes atuais da sala para passar para iniciarJogoOnline
    const snap = await window.firestore.getDoc(window.firestore.doc(window.db, "salas", salaIdAtual));
    const dados = snap.data();
    const jogadoresAtuais = dados ? dados.jogadores : [];

    // Marca a sala como "jogando" para o convidado detectar
    await window.firestore.updateDoc(
        window.firestore.doc(window.db, "salas", salaIdAtual),
        { status: "jogando", jogadores: jogadoresAtuais }
    );

    document.getElementById('tela-lobby').style.display = 'none';
    iniciarJogoOnline(salaIdAtual, true);
};

// Sair da sala antes de iniciar
window.sairDoLobby = async () => {
    if (lobbyUnsubscribe) { lobbyUnsubscribe(); lobbyUnsubscribe = null; }

    // Se era o criador, deleta/invalida a sala; se era convidado, remove do array
    if (salaIdAtual) {
        try {
            if (meuIndice === 0) {
                // Criador sai: marca sala como cancelada
                await window.firestore.updateDoc(
                    window.firestore.doc(window.db, "salas", salaIdAtual),
                    { status: "cancelada" }
                );
            } else {
                // Convidado sai: remove apenas ele do array
                const snap = await window.firestore.getDoc(window.firestore.doc(window.db, "salas", salaIdAtual));
                const dados = snap.data();
                if (dados) {
                    const novosJogadores = dados.jogadores.filter((_, i) => i !== meuIndice);
                    await window.firestore.updateDoc(
                        window.firestore.doc(window.db, "salas", salaIdAtual),
                        { jogadores: novosJogadores, status: "aguardando" }
                    );
                }
            }
        } catch(e) { console.error(e); }
    }

    salaIdAtual = null;
    meuIndice = null;
    document.getElementById('tela-lobby').style.display = 'none';
    document.getElementById('menu-inicial').style.display = 'flex';
    document.getElementById('container-principal').style.display = 'none';
    document.getElementById('setup-nomes').style.display = 'block';
    document.getElementById('campos-online').style.display = 'block';
    document.getElementById('campos-locais').style.display = 'none';
};

// --- PRESENCE E BOT DE SUBSTITUIÇÃO ---

const HEARTBEAT_INTERVAL = 5000;  // escreve presença a cada 5s
const BOT_TIMEOUT = 15000;        // promove bot após 15s sem heartbeat

// Inicia o heartbeat deste cliente
// Usa RTDB se disponível (onDisconnect server-side), senão usa Firestore como fallback
function iniciarPresence(idSala, indice) {
    function escreverHeartbeatFirestore() {
        if (!salaIdAtual) return;
        window.firestore.updateDoc(
            window.firestore.doc(window.db, "salas", idSala),
            { [`hb_${indice}`]: Date.now() }
        ).catch(() => {});
    }

    if (window.rtdb && window.rtdbFns) {
        const { ref, set, onDisconnect } = window.rtdbFns;
        const presRef = ref(window.rtdb, `presence/${idSala}/${indice}`);
        onDisconnect(presRef).remove();
        set(presRef, { online: true, ts: Date.now() });
        heartbeatInterval = setInterval(() => {
            set(presRef, { online: true, ts: Date.now() });
            escreverHeartbeatFirestore();
        }, HEARTBEAT_INTERVAL);
    } else {
        // Fallback: só heartbeat via Firestore
        escreverHeartbeatFirestore();
        heartbeatInterval = setInterval(escreverHeartbeatFirestore, HEARTBEAT_INTERVAL);
    }
}

// Para o heartbeat deste cliente
function pararPresence(idSala, indice) {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    if (window.rtdb && window.rtdbFns && idSala != null) {
        const { ref, set } = window.rtdbFns;
        set(ref(window.rtdb, `presence/${idSala}/${indice}`), null).catch(() => {});
    }
}

// Observa presença dos outros — RTDB se disponível, senão monitora heartbeat no Firestore
function observarPresenceOutros(idSala) {
    if (window.rtdb && window.rtdbFns) {
        // Método primário: Realtime Database
        const { ref, onValue } = window.rtdbFns;
        nomes.forEach((_, idx) => {
            if (idx === meuIndice) return;
            const presRef = ref(window.rtdb, `presence/${idSala}/${idx}`);
            const unsub = onValue(presRef, (snap) => {
                const dados = snap.val();
                if (dados && dados.online) {
                    clearTimeout(botTimeouts[idx]);
                    delete botTimeouts[idx];
                    removerBot(idx);
                } else {
                    if (!botTimeouts[idx]) {
                        botTimeouts[idx] = setTimeout(() => {
                            promoverBot(idx);
                            delete botTimeouts[idx];
                        }, BOT_TIMEOUT);
                    }
                }
            });
            presenceListeners.push(unsub);
        });
    } else {
        // Fallback: monitora campo hb_X no Firestore (atualizado pelo heartbeat)
        const checkInterval = setInterval(() => {
            if (!salaIdAtual || !jogoAtivo) { clearInterval(checkInterval); return; }
            window.firestore.getDoc(window.firestore.doc(window.db, "salas", idSala))
                .then(snap => {
                    if (!snap.exists()) return;
                    const d = snap.data();
                    const agora = Date.now();
                    nomes.forEach((_, idx) => {
                        if (idx === meuIndice) return;
                        const hb = d[`hb_${idx}`] || 0;
                        const offline = (agora - hb) > BOT_TIMEOUT;
                        if (offline && !botTimeouts[idx]) {
                            botTimeouts[idx] = setTimeout(() => {
                                promoverBot(idx);
                                delete botTimeouts[idx];
                            }, 0);
                        } else if (!offline && botTimeouts[idx]) {
                            clearTimeout(botTimeouts[idx]);
                            delete botTimeouts[idx];
                            removerBot(idx);
                        }
                    });
                }).catch(() => {});
        }, HEARTBEAT_INTERVAL);
        // Guarda para cancelar depois
        presenceListeners.push(() => clearInterval(checkInterval));
    }
}

// Para todos os listeners de presence
function pararObservacaoPresence() {
    presenceListeners.forEach(u => u && u());
    presenceListeners = [];
    Object.values(botTimeouts).forEach(t => clearTimeout(t));
    botTimeouts = {};
}

// Promove um bot para o slot idx: marca no Firebase
async function promoverBot(idx) {
    if (!salaIdAtual || !jogoAtivo) return;
    // Só o cliente com menor índice ativo promove (evita duplicação)
    const menorAtivo = nomes.findIndex((_, i) => i !== idx);
    if (menorAtivo !== meuIndice) return;

    try {
        await window.firestore.updateDoc(
            window.firestore.doc(window.db, "salas", salaIdAtual),
            { [`bot_${idx}`]: true }
        );
    } catch(e) { console.error("Erro ao promover bot:", e); }
}

// Remove o bot do slot idx quando jogador reconecta
async function removerBot(idx) {
    if (!salaIdAtual) return;
    const menorAtivo = nomes.findIndex((_, i) => i !== idx);
    if (menorAtivo !== meuIndice) return;

    try {
        await window.firestore.updateDoc(
            window.firestore.doc(window.db, "salas", salaIdAtual),
            { [`bot_${idx}`]: false }
        );
    } catch(e) { console.error("Erro ao remover bot:", e); }
}

// Executa a jogada do bot para o slot idx (lógica igual à IA do VS CPU)
async function jogarComoBot(idx) {
    if (!jogoAtivo || turnoAtual !== idx || !salaIdAtual) return;

    const topo = historicoDescarte[historicoDescarte.length - 1];
    const indexCarta = tipoAtaque
        ? maos[idx].findIndex(c => c.valor === tipoAtaque)
        : maos[idx].findIndex(c => c.cor === 'preto' || c.cor === topo.cor || c.valor === topo.valor);

    if (indexCarta !== -1) {
        const carta = maos[idx].splice(indexCarta, 1)[0];
        historicoDescarte.push({
            ...carta,
            rot: Math.random() * 20 - 10,
            ox:  Math.random() * 10 - 5,
            oy:  Math.random() * 10 - 5
        });

        SOM.jogarCarta();

        // Vitória do bot
        if (maos[idx].length === 0) {
            placar[idx]++;
            jogoAtivo = false;
            document.getElementById('vencedor-texto').innerText = `VITÓRIA DE ${nomes[idx]}!`;
            const btnLobby = document.getElementById('btn-voltar-lobby');
            if (btnLobby) btnLobby.style.display = 'block';
            toggleModal('modal-fim', true);
            await window.firestore.updateDoc(
                window.firestore.doc(window.db, "salas", salaIdAtual),
                { status: "fim", votosRevanche: 0 }
            );
            await sincronizarComFirebaseVencedor(idx);
            return;
        }

        // Aplica efeito da carta — replica exatamente o fluxo de trocarTurno()
        if (carta.cor === 'preto') {
            // Wild: escolhe cor aleatória
            const corEscolhida = cores[Math.floor(Math.random() * 4)];
            historicoDescarte[historicoDescarte.length - 1].cor = corEscolhida;
            if (carta.valor === '+4') { acumulado += 4; tipoAtaque = '+4'; }
        } else if (carta.valor === 'R') {
            if (nomes.length > 2) sentidoHorario = !sentidoHorario;
        } else if (carta.valor === '+2') {
            acumulado += 2; tipoAtaque = '+2';
        }

        // Avança o turno (S e R com 2J pulam, resto avança 1)
        const deveSkip = carta.valor === 'S' || (carta.valor === 'R' && nomes.length === 2);
        turnoAtual = calcularProximo(deveSkip ? 2 : 1);

        // Se há acumulado e o próximo não pode encadear: distribui e passa a vez
        if (acumulado > 0) {
            const temAtaque = maos[turnoAtual].some(c => c.valor === tipoAtaque);
            if (!temAtaque) {
                for (let j = 0; j < acumulado; j++) if (baralho.length) maos[turnoAtual].push(baralho.pop());
                acumulado = 0; tipoAtaque = null;
                turnoAtual = calcularProximo(1);
            }
            // Se tem ataque: turno fica no próximo para ele encadear (não pula)
        }

        podeInteragir = (turnoAtual === meuIndice);
        renderizar();
        await sincronizarComFirebase();
    } else {
        // Bot compra carta
        if (baralho.length) {
            const nova = baralho.pop();
            maos[idx].push(nova);
            SOM.comprarCarta();
            const topo2 = historicoDescarte[historicoDescarte.length - 1];
            const podeJogar = (nova.cor === 'preto' || nova.cor === topo2.cor || nova.valor === topo2.valor);
            if (podeJogar && !tipoAtaque) {
                // Joga a carta comprada após delay
                setTimeout(() => jogarComoBot(idx), 800);
                return;
            }
            turnoAtual = calcularProximo(1);
            podeInteragir = (turnoAtual === meuIndice);
            renderizar();
            await sincronizarComFirebase();
        }
    }
}

// Copia o código da sala para o clipboard
window.copiarCodigo = () => {
    const codigo = document.getElementById('lobby-codigo-valor').innerText;
    navigator.clipboard.writeText(codigo).then(() => {
        const icone = document.getElementById('icone-copiar');
        icone.innerText = '✓';
        setTimeout(() => { icone.innerText = '⎘'; }, 1500);
    }).catch(() => {
        // fallback para dispositivos sem clipboard API
        alert("Código da sala: " + codigo);
    });
};

// --- LÓGICA ONLINE (FIREBASE) ---
// Mantidas as funções originais para compatibilidade com o fluxo in-game

// Função original mantida (pode ainda ser chamada internamente)
window.criarSalaOnline = async () => {
    console.warn("criarSalaOnline() legado chamada — use irParaCriarSala()");
    window.irParaCriarSala();
};

window.validaEntradaSala = async () => {
    console.warn("validaEntradaSala() legado chamada — use irParaEntrarSala()");
    window.irParaEntrarSala();
};

function ouvirSala(id, souCriador) {
    window.firestore.onSnapshot(window.firestore.doc(window.db, "salas", id), (doc) => {
        const dados = doc.data();
        if (dados && dados.status === "jogando" && souCriador && !jogoAtivo) {
            iniciarJogoOnline(id, true);
        }
    });
}

async function iniciarJogoOnline(idSala, souCriador) {
    salaIdAtual = idSala;
    vsCPU = false;
    jogoAtivo = true; 

    document.getElementById('menu-inicial').style.display = 'none';
    document.getElementById('btn-sair-partida').style.display = 'flex';
    document.getElementById('tela-embaralhando').style.display = 'flex';

    if (souCriador) {
        // Busca os jogadores atuais para saber quantas mãos criar
        const snap = await window.firestore.getDoc(window.firestore.doc(window.db, "salas", idSala));
        const dadosSala = snap.data();
        const jogadoresAtuais = dadosSala ? dadosSala.jogadores : [];
        const qtd = jogadoresAtuais.length;

        criarBaralho();
        const maosIniciais = [];
        for (let i = 0; i < qtd; i++) {
            maosIniciais.push(baralho.splice(0, 7));
        }
        let inicial = baralho.find(c => c.cor !== 'preto' && !isNaN(c.valor));
        baralho = baralho.filter(c => c !== inicial);
        
        // Primeiro turno: aleatorio na 1a partida, vencedor na seguinte
        const turnoInicial = (dadosSala.vencedor != null)
            ? dadosSala.vencedor
            : Math.floor(Math.random() * qtd);

        const rodadaAtual = (dadosSala.rodada || 0) + 1;

        // Preserva placar acumulado entre rodadas
        const placarAtual = dadosSala.placar
            ? JSON.parse(dadosSala.placar)
            : new Array(qtd).fill(0);

        const estadoInicial = {
            status: "jogando",
            baralho: JSON.stringify(baralho),
            maos: JSON.stringify(maosIniciais),
            descarte: JSON.stringify([{ ...inicial, rot: 0, ox: 0, oy: 0 }]),
            placar: JSON.stringify(placarAtual),
            turno: turnoInicial,
            sentido: true,
            podeInteragir: true,
            acumulado: 0,
            tipoAtaque: null,
            vencedor: null,
            rodada: rodadaAtual
        };

        await window.firestore.updateDoc(window.firestore.doc(window.db, "salas", idSala), estadoInicial);
    }

    iniciarPresence(idSala, meuIndice);
    ouvirMudancasOnline(idSala);
    if (votosUnsubscribe) { votosUnsubscribe(); votosUnsubscribe = null; }
    votosUnsubscribe = ouvirVotosRevanche(idSala);
}

let rodadaLocal = 0; // controla qual rodada este cliente já carregou

function ouvirMudancasOnline(idSala) {
    window.firestore.onSnapshot(window.firestore.doc(window.db, "salas", idSala), (doc) => {
        const dados = doc.data();
        if (!dados) return;

        // Partida encerrada: mostra modal de fim para todos os jogadores
        if (dados.status === "fim") {
            if (jogoAtivo) {
                jogoAtivo = false;
                nomes = dados.jogadores || nomes;
                placar = JSON.parse(dados.placar || JSON.stringify(placar));
                const idxVencedor = dados.vencedor;
                if (idxVencedor != null) {
                    document.getElementById('vencedor-texto').innerText = `VITÓRIA DE ${nomes[idxVencedor]}!`;
                }
                const btnLobby = document.getElementById('btn-voltar-lobby');
                if (btnLobby) btnLobby.style.display = 'block';
                const btnNova = document.getElementById('btn-jogar-novamente');
                if (btnNova) btnNova.innerText = 'JOGAR NOVAMENTE';
                toggleModal('modal-fim', true);
                renderizar();
            }
            return;
        }

        if (dados.status !== "jogando") return;

        // Nova rodada detectada por convidados: reinicia o estado local
        if (dados.rodada && dados.rodada > rodadaLocal) {
            rodadaLocal = dados.rodada;
            jogoAtivo = false;
            // Reinicia observação de presence para nova rodada
            pararObservacaoPresence();
        }

        if (!jogoAtivo) {
            document.getElementById('tela-embaralhando').style.display = 'none';
        }

        jogoAtivo = true; 
        nomes = dados.jogadores || [];

        // Carrega estado ANTES de qualquer outra verificação
        baralho = JSON.parse(dados.baralho);
        maos = JSON.parse(dados.maos);
        historicoDescarte = JSON.parse(dados.descarte);
        placar = JSON.parse(dados.placar);
        
        turnoAtual = dados.turno;
        sentidoHorario = dados.sentido;
        acumulado = dados.acumulado || 0;
        tipoAtaque = dados.tipoAtaque || null;
        
        podeInteragir = (turnoAtual === meuIndice);

        document.getElementById('tela-embaralhando').style.display = 'none';
        document.getElementById('mesa-visual').style.visibility = 'visible';

        // Inicia observação de presence se ainda não iniciou
        if (presenceListeners.length === 0) {
            observarPresenceOutros(idSala);
        }
        
        renderizar();

        // Detecta bot APÓS estado carregado — só o cliente com menor índice ativo coordena
        nomes.forEach((_, idx) => {
            if (idx === meuIndice) return;
            const botAtivo = dados[`bot_${idx}`] === true;
            if (botAtivo && turnoAtual === idx) {
                // Verifica se sou o coordenador (menor índice ativo = não-bot)
                const euSouCoordenador = !dados[`bot_${meuIndice}`];
                if (euSouCoordenador) {
                    setTimeout(() => jogarComoBot(idx), 1200);
                }
            }
        });
    });
}

async function sincronizarComFirebase() {
    if (!salaIdAtual) return;

    await window.firestore.updateDoc(window.firestore.doc(window.db, "salas", salaIdAtual), {
        baralho: JSON.stringify(baralho),
        maos: JSON.stringify(maos),
        descarte: JSON.stringify(historicoDescarte),
        placar: JSON.stringify(placar),
        turno: turnoAtual,
        sentido: sentidoHorario,
        acumulado: acumulado,
        tipoAtaque: tipoAtaque
    });
}

async function sincronizarComFirebaseVencedor(indiceVencedor) {
    if (!salaIdAtual) return;
    await window.firestore.updateDoc(window.firestore.doc(window.db, "salas", salaIdAtual), {
        baralho: JSON.stringify(baralho),
        maos: JSON.stringify(maos),
        descarte: JSON.stringify(historicoDescarte),
        placar: JSON.stringify(placar),
        turno: turnoAtual,
        sentido: sentidoHorario,
        acumulado: 0,
        tipoAtaque: null,
        vencedor: indiceVencedor
    });
}

window.voltarLobbyOnline = async () => {
    if (!salaIdAtual) { location.reload(); return; }
    toggleModal('modal-fim', false);
    votouJogarNovamente = false;
    jogoAtivo = false;
    pararObservacaoPresence();
    pararPresence(salaIdAtual, meuIndice);

    // Remove bots do array de jogadores e limpa campos bot_X
    const snap = await window.firestore.getDoc(window.firestore.doc(window.db, "salas", salaIdAtual));
    const dadosAtuais = snap.data() || {};
    const jogadoresOriginais = dadosAtuais.jogadores || nomes;

    // Filtra jogadores cujo slot tem bot ativo
    const jogadoresSemBot = jogadoresOriginais.filter((_, i) => !dadosAtuais[`bot_${i}`]);

    // Monta update limpando todos os campos bot_X
    const update = { status: "lobby", votosRevanche: 0, jogadores: jogadoresSemBot };
    jogadoresOriginais.forEach((_, i) => { update[`bot_${i}`] = false; });

    await window.firestore.updateDoc(
        window.firestore.doc(window.db, "salas", salaIdAtual),
        update
    );

    document.getElementById('mesa-visual').style.visibility = 'hidden';
    document.getElementById('btn-sair-partida').style.display = 'none';

    // Recalcula meuIndice após remover bots
    const meuNome = nomes[meuIndice];
    const novoIndice = jogadoresSemBot.indexOf(meuNome);
    meuIndice = novoIndice >= 0 ? novoIndice : 0;

    abrirLobby(salaIdAtual, meuIndice === 0, meuNome, meuIndice);
};

// --- BOTÃO ONE ---
let oneTimer = null;
let oneDisponivel = false;

function verificarBotaoOne() {
    // Botão ONE só funciona no modo online
    if (!salaIdAtual) return;
    // Só dispara se ainda não está ativo (evita aparecer duas vezes)
    if (oneDisponivel) return;

    const btnOne = document.getElementById('btn-one');
    if (!btnOne || !jogoAtivo) return;

    oneDisponivel = true;
    btnOne.style.display = 'flex';

    // Penalidade após 2.5s sem clicar
    oneTimer = setTimeout(() => {
        if (oneDisponivel) {
            oneDisponivel = false;
            btnOne.style.display = 'none';
            if (baralho.length) {
                maos[meuIndice].push(baralho.pop());
                sincronizarComFirebase();
                renderizar();
            }
        }
    }, 2500);
}

window.clicarOne = function() {
    if (!oneDisponivel) return;
    oneDisponivel = false;
    clearTimeout(oneTimer);
    document.getElementById('btn-one').style.display = 'none';
    SOM.one();
};

// --- EXPORTAÇÕES ---
// Para presence ao sair (botão ✕ → location.reload já dispara onDisconnect server-side,
// mas limpamos os timers locais preventivamente)
window.addEventListener('beforeunload', () => {
    pararPresence(salaIdAtual, meuIndice);
    pararObservacaoPresence();
});

window.abrirSetup = abrirSetup; 
window.voltarAoMenu = voltarAoMenu; 
window.prepararInicio = prepararInicio;
window.toggleModal = toggleModal; 
window.comprarCarta = comprarCarta; 
window.jogar = jogar;
window.novaPartida = async () => {
    if (!salaIdAtual) {
        toggleModal('modal-fim', false);
        reiniciarPartida();
        return;
    }

    // Online: sistema de votação
    if (votouJogarNovamente) return; // evita duplo clique
    votouJogarNovamente = true;

    const qtdJogadores = nomes.length;
    const snap = await window.firestore.getDoc(window.firestore.doc(window.db, "salas", salaIdAtual));
    const dados = snap.data();
    const votosAtuais = (dados.votosRevanche || 0) + 1;

    // Atualiza botão para mostrar votos
    const btnNova = document.querySelector('#modal-fim .btn-menu[onclick*="novaPartida"]');
    if (btnNova) btnNova.innerText = `AGUARDANDO... (${votosAtuais}/${qtdJogadores})`;

    await window.firestore.updateDoc(
        window.firestore.doc(window.db, "salas", salaIdAtual),
        { votosRevanche: votosAtuais }
    );
};

// Detecta quando todos votaram OU quando alguém voltou ao lobby
function ouvirVotosRevanche(idSala) {
    return window.firestore.onSnapshot(
        window.firestore.doc(window.db, "salas", idSala),
        async (doc) => {
            const dados = doc.data();
            if (!dados) return;

            const qtd = (dados.jogadores || []).length;

            // Todos votaram → criador inicia nova rodada
            if (dados.votosRevanche >= qtd && dados.status === "fim") {
                if (meuIndice === 0) {
                    // Criador: inicia nova rodada (muda status para "jogando")
                    await window.firestore.updateDoc(
                        window.firestore.doc(window.db, "salas", idSala),
                        { votosRevanche: 0 }
                    );
                    iniciarJogoOnline(idSala, true);
                }
                // Convidados: aguardam o snapshot com nova rodada (detectado abaixo)
            }

            // Convidados detectam nova rodada quando criador subiu novo estado
            if (dados.status === "jogando" && dados.rodada > rodadaLocal && meuIndice !== 0) {
                toggleModal('modal-fim', false);
                votouJogarNovamente = false;
                jogoAtivo = false;
                document.getElementById('tela-embaralhando').style.display = 'flex';
                // ouvirMudancasOnline vai carregar o novo estado automaticamente
            }

            // Alguém voltou ao lobby → todos voltam
            if (dados.status === "lobby") {
                // Cancela este listener antes de reabrir o lobby
                if (votosUnsubscribe) { votosUnsubscribe(); votosUnsubscribe = null; }
                toggleModal('modal-fim', false);
                votouJogarNovamente = false;
                jogoAtivo = false;
                pararObservacaoPresence();
                pararPresence(idSala, meuIndice);
                document.getElementById('mesa-visual').style.visibility = 'hidden';
                document.getElementById('btn-sair-partida').style.display = 'none';
                const meuNome = nomes[meuIndice];
                abrirLobby(idSala, meuIndice === 0, meuNome, meuIndice);
            }
        }
    );
}