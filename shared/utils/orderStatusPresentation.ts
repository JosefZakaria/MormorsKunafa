import { HOJA_LOCATION_ID, MOLLEVANGEN_LOCATION_ID, type PublicOrderStatus } from '../types/index.js';

export function orderStatusPresentation(order: PublicOrderStatus, now = Date.now()) {
  const base = { showTimer: false, showSteps: false };
  if (order.status === 'avbruten') return { ...base, title: 'Beställningen har avbrutits',
    message: 'Kontakta oss och uppge ordernumret om du har frågor.' };
  if (order.status === 'uthämtad' || order.status === 'levererad') return { ...base,
    title: order.status === 'uthämtad' ? 'Beställningen är uthämtad' : 'Beställningen är levererad',
    message: 'Tack för din beställning! Spara ordernumret om du behöver kontakta oss.' };
  if (order.paymentStatus !== 'paid') return { ...base, title: 'Väntar på betalning',
    message: 'Betalningen är ännu inte bekräftad. Om du redan har betalat uppdateras statusen när bekräftelsen kommer.' };
  if (order.orderType === 'delivery') return { ...base, showSteps: true,
    title: order.status === 'klar' ? 'Din beställning är klar för leverans' : 'Din leveransbeställning är mottagen',
    message: order.showDeliveryEstimate === false
      ? 'Vi kontaktar dig om leveransen.'
      : 'Leverans sker normalt inom 1–2 arbetsdagar. Vi kontaktar dig om leveransen.' };
  const place = order.locationId === HOJA_LOCATION_ID ? ' på Höja'
    : order.locationId === MOLLEVANGEN_LOCATION_ID ? ' på Möllevången' : '';
  const scheduled = order.scheduledTime ? new Date(order.scheduledTime) : null;
  if (scheduled && scheduled.getTime() > now && ['ny','mottagen'].includes(order.status)) {
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm',
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(scheduled);
    return { ...base, title: 'Din förbeställning är bokad',
      message: `${order.orderType === 'eat-here' ? 'Planerad tid' : 'Planerad upphämtning'}${place}: ${date}.` };
  }
  if (order.status === 'klar') return { ...base, showSteps: true, title: 'Din beställning är klar!',
    message: `Din beställning är färdig${place}. Välkommen!` };
  return { ...base, showSteps: true, showTimer: !!order.estimatedReadyTime,
    title: order.status === 'påbörjad' ? 'Vi förbereder din beställning' : 'Beställningen är mottagen',
    message: `Här ser du statusen för din beställning${place}. Tiden är en uppskattning.` };
}
