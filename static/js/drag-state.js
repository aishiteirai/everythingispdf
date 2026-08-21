/**
 * Quando um ponteiro deixa de ser clique e passa a ser arrasto.
 *
 * Sem DOM: é a regra, não a fiação. As duas dinâmicas do site — mover as
 * bolinhas do hub e reordenar as miniaturas da galeria — decidem isso do mesmo
 * jeito, e antes tinham duas implementações, uma delas com drag-and-drop HTML5,
 * que não dispara em toque.
 */

/** Quanto o ponteiro precisa andar para virar arrasto, no mouse ou caneta. */
export const LIMIAR_PX = 6;

/**
 * Dedo treme mais que mouse. Com o mesmo limiar dos dois, tocar para navegar
 * viraria arrasto e o link nunca abriria no celular.
 */
export const LIMIAR_TOQUE_PX = 12;

/**
 * Quanto segurar, no toque, antes de o arrasto começar.
 *
 * Existe porque numa lista que rola o arrasto por toque é ambíguo: deslizar o
 * dedo num cartão pode significar reordenar ou rolar a página. Segurar
 * desfaz a ambiguidade sem tirar a rolagem, que é o que `touch-action: none`
 * faria.
 */
export const ESPERA_NO_TOQUE_MS = 300;

export function limiarDe(tipoDePonteiro) {
    return tipoDePonteiro === 'touch' ? LIMIAR_TOQUE_PX : LIMIAR_PX;
}

export function virouArrasto(dx, dy, limiar = LIMIAR_PX) {
    return Math.hypot(dx, dy) > limiar;
}

/**
 * Decide o que fazer com um ponteiro que está pressionado.
 *
 * - `'arrastar'`: começa agora
 * - `'desistir'`: não é arrasto, e não deve ser. No toque com espera, quer
 *   dizer que o dedo deslizou antes da hora — é rolagem, e não interferimos
 * - `'esperar'`: ainda não se sabe
 *
 * `esperaNoToqueMs` ausente faz o toque se comportar como o mouse: só limiar.
 */
export function decideInicio({ tipo, dx, dy, decorridoMs, esperaNoToqueMs }) {
    const limiar = limiarDe(tipo);
    const andou = virouArrasto(dx, dy, limiar);

    if (tipo === 'touch' && esperaNoToqueMs) {
        if (decorridoMs >= esperaNoToqueMs) return 'arrastar';

        return andou ? 'desistir' : 'esperar';
    }

    return andou ? 'arrastar' : 'esperar';
}
