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
              يتم تشغيل هذا الموقع من قبل <strong>Mormors Kunafa</strong>.<br />
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
              <li><strong>الدفع عند الاستلام:</strong> متاح في المحل للطلبات الخارجية وتناول الطعام على المكان.</li>
            </ul>
          </section>

          <section className="legal-section alert-box">
            <h2>3. حق الإلغاء والاسترجاع (Ångerrätt) – تنبيه هام للحلويات والمأكولات</h2>
            <p>
              وفقاً لقانون العقود عن بُعد السويدي (Distansavtalslagen الفصل 2 الفقرة 11 البند 2)، 
              <strong>يُستثنى الطعام والأغذية الطازجة والمأكولات المصنوعة حسب الطلب (مثل الكنافة الساخنة والحلويات الطازجة) من حق الاسترجاع والإلغاء بعد بدء التحضير أو التوصيل.</strong>
            </p>
            <p>
              يمكن إلغاء الطلب فقط قبل بدء تحضيره في المطبخ عن طريق الاتصال المباشر بالمحل على الرقم 072-868 25 92.
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
              تخضع النزاعات للقانون السويدي، ويمكن للزبون تقديم شكوى إلى الهيئة السويدية لشكاوى المستهلكين (ARN - Allmänna reklamationsnämnden) أو منصة الاتحاد الأوروبي لتسوية النزاعات عبر الإنترنت (EU ODR).
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
              This website is operated by <strong>Mormors Kunafa</strong>.<br />
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
              <li><strong>Pay on Pickup:</strong> Available for takeaway and dine-in orders at the shop.</li>
            </ul>
          </section>

          <section className="legal-section alert-box">
            <h2>3. Right of Withdrawal (Ångerrätt) – Important Notice for Food Items</h2>
            <p>
              According to the Swedish Distance Contracts Act (Distansavtalslagen Ch. 2 § 11 item 2), 
              <strong>freshly prepared food and perishable items (such as freshly baked kunafa and warm pastries) are strictly exempt from the right of withdrawal once preparation has commenced.</strong>
            </p>
            <p>
              Orders can only be cancelled prior to kitchen preparation by calling our shop directly at 072-868 25 92.
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
              If your order is damaged or incorrect, please contact us immediately by phone or email. In the event of a dispute that cannot be resolved directly, consumers may submit a claim to the Swedish National Board for Consumer Disputes (ARN - Allmänna reklamationsnämnden) or via the EU Online Dispute Resolution (ODR) platform.
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
            Webbplatsen drivs av <strong>Mormors Kunafa</strong>.<br />
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
            <li><strong>Betala vid upphämtning:</strong> Kontant eller kort i vår butik på Karolingatan 1.</li>
          </ul>
        </section>

        <section className="legal-section alert-box">
          <h2>3. Ångerrätt – Viktig information om livsmedel</h2>
          <p>
            Enligt lagen om distansavtal och avtal utanför affärslokaler (Distansavtalslagen 2005:59, 2 kap. 11 § punkt 2) gäller 
            <strong>inte ångerrätt för varor som snabbt kan försämras eller bli för gamla, vilket omfattar färskt tillagad mat och varma bakverk såsom kunafa.</strong>
          </p>
          <p>
            När köpet har genomförts och tillagning i köket har påbörjats kan beställningen därför inte ångras eller avbeställas. Önskar du avbryta en beställning innan tillagning påbörjats måste du omedelbart kontakta butiken på telefon 072-868 25 92.
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
            Vid eventuell tvist som inte kan lösas i samråd med oss följer vi rekommendationer från Allmänna reklamationsnämnden (ARN). Du kan kontakta ARN via <a href="https://www.arn.se" target="_blank" rel="noopener noreferrer">www.arn.se</a> eller Box 174, 101 23 Stockholm. Du kan även använda EU-kommissionens plattform för online-tvistlösning (ODR) på <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">http://ec.europa.eu/consumers/odr</a>.
          </p>
        </section>
      </div>
    </div>
  );
};
