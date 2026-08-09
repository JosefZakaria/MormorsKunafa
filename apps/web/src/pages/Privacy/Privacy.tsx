import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import '../Terms/Terms.css';

export const Privacy: React.FC = () => {
  const { language } = useLanguage();

  if (language === 'ar') {
    return (
      <div className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">سياسة الخصوصية (Integritetspolicy / GDPR)</h1>
          <p className="legal-lead">
            في كنافة جدتي (Mormors Kunafa)، نولي أهمية قصوى لخصوصيتك وحماية بياناتك الشخصية. تشرح هذه السياسة كيفية جمع بياناتك واستخدامها وحمايتها وفقاً للائحة العامة لحماية البيانات في الاتحاد الأوروبي (GDPR).
          </p>

          <section className="legal-section">
            <h2>1. المسؤول عن البيانات (Personuppgiftsansvarig)</h2>
            <p>
              المسؤول عن معالجة بياناتك الشخصية هو:<br />
              <strong>Mormors Kunafa Aktiebolag</strong><br />
              رقم تسجيل الشركة: 559424-4823<br />
              العنوان: Karolingatan 1, 212 34 Malmö, السويد<br />
              البريد الإلكتروني: info@mormorskunafa.se<br />
              الهاتف: 072-868 25 92
            </p>
          </section>

          <section className="legal-section">
            <h2>2. البيانات التي نجمعها (Personuppgifter vi samlar in)</h2>
            <p>عند استخدام موقعنا أو تقديم طلب، قد نجمع البيانات التالية:</p>
            <ul>
              <li><strong>معلومات الاتصال:</strong> الاسم الكامل، رقم الهاتف، البريد الإلكتروني.</li>
              <li><strong>معلومات التوصيل:</strong> العنوان، الشارع، الرمز البريدي والمدينة (للطلبات المنزلية).</li>
              <li><strong>تفاصيل الطلب:</strong> المنتجات المطلوبة، وقت الاستلام المختار، والتعليقات الخاصة.</li>
              <li><strong>البيانات التقنية:</strong> عنوان IP، نوع المتصفح، وسجلات الجلسة.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>3. الغرض والأساس القانوني للمعالجة (Ändamål och Rättslig Grund)</h2>
            <ul>
              <li><strong>إتمام الطلبات والخدمة (تنفيذ العقد - Art 6.1 b GDPR):</strong> لمعالجة الطلب، وتجهيز الحلويات، وإرسال رسائل التجميع والتوصيل عبر SMS أو البريد الإلكتروني.</li>
              <li><strong>الالتزام بالقوانين المحاسبية (التزام قانوني - Art 6.1 c GDPR):</strong> حفظ سجلات المعاملات والسيولة المالية لمدة 7 سنوات بموجب قانون المحاسبة السويدي (Bokföringslagen 1999:1078).</li>
              <li><strong>تحسين الخدمة والأمان (المصلحة المشروعة - Art 6.1 f GDPR):</strong> لحماية الموقع من الاحتيال ومنع سوء الاستخدام.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. معالجة البيانات مع أطراف ثالثة (Tredjepartsbiträden)</h2>
            <p>نحن لا نبيع أو نؤجر بياناتك الشخصية لأي طرف ثالث. نقوم بمشاركة البيانات فقط مع معالجي البيانات الموثوقين لإتمام الخدمة:</p>
            <ul>
              <li><strong>Stripe وSwish:</strong> لمعالجة المدفوعات.</li>
              <li><strong>Resend وSinch:</strong> لإرسال البريد الإلكتروني ورسائل SMS الخاصة بالطلب.</li>
              <li><strong>Supabase:</strong> لتخزين بيانات الطلب.</li>
              <li><strong>Vercel:</strong> لاستضافة الموقع وواجهة البرمجة.</li>
              <li><strong>Upstash:</strong> للحد من إساءة استخدام الخدمة.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>5. فترة الاحتفاظ بالبيانات (Lagringstid)</h2>
            <p>
              نحتفظ ببيانات الطلبات والبيانات المالية لمدة <strong>7 سنوات</strong> وفقاً لمتطلبات قانون المحاسبة السويدي (Bokföringslagen). 
              البيانات الأخرى غير المحاسبية تُحذف أو تُجهل عندما لا نعود بحاجة إليها لإكمال الخدمة.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. حقوقك (Dina rättigheter)</h2>
            <p>بموجب قانون GDPR، لديك الحقوق التالية:</p>
            <ul>
              <li>الحصول على نسخة من بياناتك (Registerutdrag).</li>
              <li>تصحيح أي بيانات غير دقيقة (Rättelse).</li>
              <li>طلب حذف بياناتك (Radering / "الحق في النسيان") بشرط عدم تعارضها مع قوانين المحاسبة.</li>
              <li>تقديم شكوى إلى الهيئة السويدية لحماية الخصوصية (IMY - Integritetsskyddsmyndigheten) عبر <a href="https://www.imy.se" target="_blank" rel="noopener noreferrer">www.imy.se</a>.</li>
            </ul>
          </section>
        </div>
      </div>
    );
  }

  if (language === 'en') {
    return (
      <div className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">Privacy Policy (GDPR)</h1>
          <p className="legal-lead">
            At Mormors Kunafa, we value your privacy and are committed to protecting your personal data. This policy explains how we collect, process, and safeguard your data in accordance with the EU General Data Protection Regulation (GDPR).
          </p>

          <section className="legal-section">
            <h2>1. Data Controller</h2>
            <p>
              The data controller responsible for your personal data is:<br />
              <strong>Mormors Kunafa Aktiebolag</strong><br />
              Company registration number: 559424-4823<br />
              Address: Karolingatan 1, 212 34 Malmö, Sweden<br />
              Email: info@mormorskunafa.se<br />
              Phone: 072-868 25 92
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Personal Data We Collect</h2>
            <p>When you visit our site or place an order, we may collect:</p>
            <ul>
              <li><strong>Contact details:</strong> Name, phone number, email address.</li>
              <li><strong>Delivery details:</strong> Street address, postal code, city (for home delivery orders).</li>
              <li><strong>Order details:</strong> Items ordered, pickup time, special requests.</li>
              <li><strong>Technical data:</strong> IP address, browser type, device information.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>3. Purpose and Legal Basis for Processing</h2>
            <ul>
              <li><strong>Order Fulfillment (Performance of Contract - Art. 6.1 b GDPR):</strong> To process, prepare, deliver, and send SMS/email order updates.</li>
              <li><strong>Accounting Compliance (Legal Obligation - Art. 6.1 c GDPR):</strong> To retain sales transaction receipts for 7 years as required by the Swedish Bookkeeping Act (Bokföringslagen 1999:1078).</li>
              <li><strong>Security & Improvements (Legitimate Interest - Art. 6.1 f GDPR):</strong> To prevent fraud and abuse.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. Third-Party Data Processors</h2>
            <p>We do not sell your personal data. We share necessary data only with trusted service providers to fulfill your order:</p>
            <ul>
              <li><strong>Stripe and Swish:</strong> Payment processing.</li>
              <li><strong>Resend and Sinch:</strong> Order emails and SMS notifications.</li>
              <li><strong>Supabase:</strong> Order database hosting.</li>
              <li><strong>Vercel:</strong> Website and API hosting.</li>
              <li><strong>Upstash:</strong> Abuse prevention and request rate limiting.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>5. Data Retention</h2>
            <p>
              Financial records and order receipts are retained for <strong>7 years</strong> in accordance with Swedish bookkeeping laws (Bokföringslagen). Personal data not required by law is deleted once it is no longer needed.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Your GDPR Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Request access to your personal data (Register extract).</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request erasure of your data ("right to be forgotten"), subject to statutory retention obligations.</li>
              <li>Lodge a complaint with the Swedish Authority for Privacy Protection (IMY) via <a href="https://www.imy.se" target="_blank" rel="noopener noreferrer">www.imy.se</a>.</li>
            </ul>
          </section>
        </div>
      </div>
    );
  }

  // Swedish default
  return (
    <div className="legal-page">
      <div className="legal-container">
        <h1 className="legal-title">Integritetspolicy (GDPR)</h1>
        <p className="legal-lead">
          Hos Mormors Kunafa värnar vi om din personliga integritet. Denna integritetspolicy beskriver hur vi samlar in, använder, sparar och skyddar dina personuppgifter i enlighet med EU:s dataskyddsförordning (GDPR).
        </p>

        <section className="legal-section">
          <h2>1. Personuppgiftsansvarig</h2>
          <p>
            Personuppgiftsansvarig för behandlingen av dina personuppgifter är:<br />
            <strong>Mormors Kunafa Aktiebolag</strong><br />
            Organisationsnummer: 559424-4823<br />
            Adress: Karolingatan 1, 212 34 Malmö<br />
            E-post: info@mormorskunafa.se<br />
            Telefon: 072-868 25 92
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Personuppgifter vi samlar in</h2>
          <p>När du besöker vår webbplats eller genomför en beställning samlar vi in följande uppgifter:</p>
          <ul>
            <li><strong>Kontaktuppgifter:</strong> Namn, telefonnummer och e-postadress.</li>
            <li><strong>Leveransuppgifter:</strong> Gatuadress, postnummer och ort (vid hemleverans).</li>
            <li><strong>Orderinformation:</strong> Beställda produkter, upphämtningstid, betalningsmetod och eventuella instruktioner.</li>
            <li><strong>Teknisk data:</strong> IP-adress, enhetsinformation och loggar för säkerhet och funktion.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Ändamål och rättslig grund för behandlingen</h2>
          <ul>
            <li><strong>Hantera och leverera beställning (Fullgörande av avtal - Art 6.1 b GDPR):</strong> För att behandla din order, tillaga maten, skicka orderbekräftelse via e-post samt SMS-avisering när maten är klar eller på väg.</li>
            <li><strong>Bokföring och redovisning (Rättslig förpliktelse - Art 6.1 c GDPR):</strong> Vi är enligt den svenska **Bokföringslagen (1999:1078)** skyldiga att spara orderunderlag och transaktionshistorik i **7 år**.</li>
            <li><strong>Säkerhet och missbruksförebyggande (Berättigat intresse - Art 6.1 f GDPR):</strong> För att skydda våra system mot missbruk och bedrägerier.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Tredjepartsbiträden (Personuppgiftsbiträden)</h2>
          <p>Vi säljer eller vidarebefordrar aldrig dina personuppgifter till tredje part i marknadsföringssyfte. Vi delar endast nödvändiga uppgifter med betrodda leverantörer för att genomföra tjänsten:</p>
          <ul>
            <li><strong>Stripe och Swish:</strong> För betalningshantering.</li>
            <li><strong>Resend och Sinch:</strong> För ordermejl och SMS-aviseringar.</li>
            <li><strong>Supabase:</strong> För lagring av orderuppgifter.</li>
            <li><strong>Vercel:</strong> För drift av webbplats och API.</li>
            <li><strong>Upstash:</strong> För missbruksskydd och anropsbegränsning.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Hur länge sparar vi dina uppgifter?</h2>
          <p>
            Order- och betalningsunderlag sparas i <strong>7 år</strong> i enlighet med Bokföringslagen. 
            Personuppgifter som inte omfattas av lagstadgade krav raderas eller anonymiseras så snart de inte längre behövs för att uppfylla det ändamål de samlades in för.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Dina rättigheter enligt GDPR</h2>
          <p>Du har rätt att:</p>
          <ul>
            <li>Begära ett <strong>registerutdrag</strong> över vilka personuppgifter vi behandlar om dig.</li>
            <li>Begära <strong>rättelse</strong> av felaktiga eller ofullständiga uppgifter.</li>
            <li>Begära <strong>radering</strong> ("rätten att bli bortglömd") av dina uppgifter i den mån det inte strider mot Bokföringslagens lagkrav.</li>
            <li>Lämna klagomål till tillsynsmyndigheten <strong>Integritetsskyddsmyndigheten (IMY)</strong> om du anser att vi behandlar dina personuppgifter i strid med GDPR (<a href="https://www.imy.se" target="_blank" rel="noopener noreferrer">www.imy.se</a>).</li>
          </ul>
        </section>
      </div>
    </div>
  );
};
