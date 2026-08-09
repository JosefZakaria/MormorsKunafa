import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import './Terms.css';

export const Terms: React.FC = () => {
  const { language } = useLanguage();

  if (language === 'ar') {
    return (
      <div className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">الشروط والأحكام (Köpvillkor)</h1>
          <p className="legal-lead">
            مرحباً بكم في كنافة جدتي (Mormors Kunafa). تسرنا خدمتكم! توضح هذه الشروط والأحكام قواعد القوانين السويدية المتعلقة بالشراء والتوصيل وحقوق المستهلك.
          </p>

          <section className="legal-section">
            <h2>1. معلومات الشركة (Företagsinformation)</h2>
            <p>
              يتم تشغيل هذا الموقع من قبل <strong>Mormors Kunafa Aktiebolag</strong>.<br />
              <strong>رقم تسجيل الشركة:</strong> 559424-4823<br />
              <strong>العنوان:</strong> Karolingatan 1, 212 34 Malmö, السويد.<br />
              <strong>الهاتف:</strong> 072-868 25 92<br />
              <strong>البريد الإلكتروني:</strong> info@mormorskunafa.se
            </p>
          </section>

          <section className="legal-section">
            <h2>2. الأسعار والدفع (Priser och Betalning)</h2>
            <p>
              جميع الأسعار على الموقع معلنة بالكرونة السويدية (SEK) وتتضمن ضريبة القيمة المضافة (moms).
            </p>
            <ul>
              <li><strong>الدفع بالبطاقة:</strong> يتم بأمان عبر Stripe.</li>
              <li><strong>الدفع عبر Swish:</strong> الدفع المباشر عبر تطبيق Swish في السويد.</li>
            </ul>
          </section>

          <section className="legal-section alert-box">
            <h2>3. حق الإلغاء والاسترجاع (Ångerrätt) – تنبيه هام للحلويات والمأكولات</h2>
            <p>
              وفقاً لقانون العقود عن بُعد السويدي (Distansavtalslagen الفصل 2 الفقرة 11 البند 4)،
              <strong>لا ينطبق حق الانسحاب القانوني على الأغذية التي يمكن أن تتلف بسرعة.</strong>
            </p>
            <p>
              يمكننا مع ذلك محاولة إيقاف الطلب قبل بدء التحضير إذا اتصلت فوراً على 072-868 25 92، لكن ذلك غير مضمون.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. التوصيل والاستلام (Leverans och Upphämtning)</h2>
            <p>
              <strong>الاستلام من المحل:</strong> يجهز الطلب في الوقت المحدد عند الطلب. يرجى إبراز رقم الطلب عند الاستلام.<br />
              <strong>التوصيل للمنزل:</strong> يستغرق التوصيل داخل السويد 1-2 أيام عمل، برسوم توصيل قدرها 79 كرونة.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. الشكاوى والنزاعات (Reklamation och Tvister)</h2>
            <p>
              في حال وجود أي خطأ أو تلف في الطلب، يرجى التواصل معنا فوراً عبر الهاتف أو البريد الإلكتروني مع إرفاق تفاصيل وصور للطلب.<br />
              بعد منحنا فرصة للرد على الشكوى، يمكن للزبون تقديم النزاع إلى الهيئة السويدية لشكاوى المستهلكين (ARN - Allmänna reklamationsnämnden) عبر arn.se.
            </p>
          </section>
        </div>
      </div>
    );
  }

  if (language === 'en') {
    return (
      <div className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">Terms & Conditions</h1>
          <p className="legal-lead">
            Welcome to Mormors Kunafa! These Terms and Conditions govern your purchases and use of our online store in accordance with Swedish and EU consumer laws.
          </p>

          <section className="legal-section">
            <h2>1. Company Information</h2>
            <p>
              This website is operated by <strong>Mormors Kunafa Aktiebolag</strong>.<br />
              <strong>Company registration number:</strong> 559424-4823<br />
              <strong>Address:</strong> Karolingatan 1, 212 34 Malmö, Sweden.<br />
              <strong>Phone:</strong> 072-868 25 92<br />
              <strong>Email:</strong> info@mormorskunafa.se
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Prices & Payment</h2>
            <p>
              All prices shown on the website are stated in SEK and include Swedish VAT (moms).
            </p>
            <ul>
              <li><strong>Card Payment:</strong> Processed securely via Stripe.</li>
              <li><strong>Swish:</strong> Instant mobile payment via Swish in Sweden.</li>
            </ul>
          </section>

          <section className="legal-section alert-box">
            <h2>3. Right of Withdrawal (Ångerrätt) – Important Notice for Food Items</h2>
            <p>
              Under the Swedish Distance Contracts Act (Distansavtalslagen Ch. 2 § 11 item 4),
              <strong>there is no statutory right of withdrawal for food that can deteriorate quickly.</strong>
            </p>
            <p>
              We may nevertheless be able to stop an order before preparation starts if you call 072-868 25 92 immediately, but this cannot be guaranteed.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. Delivery & Pickup</h2>
            <p>
              <strong>Pickup:</strong> Your order will be prepared for the chosen collection time. Please show your order number upon arrival.<br />
              <strong>Home Delivery:</strong> Delivery across Sweden takes 1–2 business days with a flat delivery fee of 79 SEK.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Complaints & Disputes</h2>
            <p>
              If your order is damaged or incorrect, please contact us immediately by phone or email. After giving us an opportunity to respond, consumers may submit an eligible dispute to the Swedish National Board for Consumer Disputes (ARN) at <a href="https://www.arn.se" target="_blank" rel="noopener noreferrer">arn.se</a>.
            </p>
          </section>
        </div>
      </div>
    );
  }

  // Swedish default
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">Köpvillkor & Användarvillkor</h1>
        <p className="legal-lead">
          Välkommen till Mormors Kunafa! Dessa köpvillkor gäller för alla beställningar som görs via vår webbplats och följer svensk konsumenträtt, E-handelslagen och Distansavtalslagen.
        </p>

        <section className="legal-section">
          <h2>1. Företagsinformation</h2>
          <p>
            Webbplatsen drivs av <strong>Mormors Kunafa Aktiebolag</strong>.<br />
            <strong>Organisationsnummer:</strong> 559424-4823<br />
            <strong>Adress:</strong> Karolingatan 1, 212 34 Malmö<br />
            <strong>Telefon:</strong> 072-868 25 92<br />
            <strong>E-post:</strong> info@mormorskunafa.se
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Priser och Betalning</h2>
          <p>
            Alla priser på webbplatsen anges i svenska kronor (SEK) och inkluderar lagstadgad mervärdesskatt (moms).
          </p>
          <ul>
            <li><strong>Kortbetalning:</strong> Genomförs säkert via Stripe (Visa, Mastercard, Amex, Apple Pay m.fl.).</li>
            <li><strong>Swish:</strong> Direktbetalning via Swish-appen.</li>
          </ul>
        </section>

        <section className="legal-section alert-box">
          <h2>3. Ångerrätt – Viktig information om livsmedel</h2>
          <p>
            Enligt lagen om distansavtal och avtal utanför affärslokaler (2005:59, 2 kap. 11 § punkt 4) gäller
            <strong>ingen lagstadgad ångerrätt för varor som snabbt kan försämras eller bli för gamla, exempelvis färsk mat.</strong>
          </p>
          <p>
            Vi kan ändå försöka stoppa en order innan tillagningen har börjat om du omedelbart ringer 072-868 25 92, men det kan inte garanteras.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Leverans och Upphämtning</h2>
          <p>
            <strong>Upphämtning i butik:</strong> Beställningen tillagas och förbereds till den angivna upphämtningstiden på Karolingatan 1 i Malmö. Uppge ditt ordernummer vid uthämtning.<br />
            <strong>Hemleverans:</strong> Leveranstid är normalt 1–2 arbetsdagar inom Sverige. Leveransavgiften är 79 kr per beställning.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Reklamation och Tvist</h2>
          <p>
            Om din beställning är felaktig eller skadad vid leverans/upphämtning ska du kontakta oss omedelbart på 072-868 25 92 eller info@mormorskunafa.se med beskrivning och eventuell bild på felet. Vid godkänd reklamation ersätter vi produkten eller återbetalar beloppet.
          </p>
          <p>
            Om vi har fått möjlighet att ta ställning till ditt krav och tvisten ändå inte löses kan du anmäla ett behörigt ärende till Allmänna reklamationsnämnden (ARN). Vi följer ARN:s rekommendationer. Läs om villkor och aktuell avgift på <a href="https://www.arn.se" target="_blank" rel="noopener noreferrer">arn.se</a>.
          </p>
        </section>
      </div>
    </div>
  );
};
