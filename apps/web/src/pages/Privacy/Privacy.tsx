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
          <p><strong>الإصدار 2.2 – ساري اعتباراً من 19 أغسطس 2026.</strong></p>

          <section className="legal-section">
            <h2>1. المسؤول عن البيانات (Personuppgiftsansvarig)</h2>
            <p>
              المسؤول عن معالجة بياناتك الشخصية هو:<br />
              <strong>Mormors Kunafa Aktiebolag</strong><br />
              رقم تسجيل الشركة: 559424-4823<br />
              رقم ضريبة القيمة المضافة: SE559424482301<br />
              العنوان: Karolingatan 1, 212 34 Malmö, السويد<br />
              البريد الإلكتروني: Mormorskunafa@gmail.com<br />
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
              <li><strong>خدمة العملاء والشكاوى والنزاعات (المصلحة المشروعة - Art 6.1 f GDPR):</strong> للاحتفاظ ببيانات اتصال محدودة وربطها بالطلب حتى نتمكن من العثور على المشتريات السابقة ومعالجة الشكاوى خلال مدتها القانونية.</li>
              <li><strong>تحسين الخدمة والأمان (المصلحة المشروعة - Art 6.1 f GDPR):</strong> لحماية الموقع من الاحتيال ومنع سوء الاستخدام.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. الجهات المستلمة ومقدمو الخدمات (Mottagare och leverantörer)</h2>
            <p>نحن لا نبيع أو نؤجر بياناتك الشخصية لأي طرف ثالث. نشارك فقط البيانات اللازمة مع الجهات التي تساعد في تنفيذ الخدمة:</p>
            <ul>
              <li><strong>Stripe وSwish:</strong> لمعالجة المدفوعات.</li>
              <li><strong>Resend وSinch:</strong> لإرسال البريد الإلكتروني ورسائل SMS الخاصة بالطلب.</li>
              <li><strong>Google Gmail:</strong> لاستقبال طلبات العملاء والشكاوى وطلبات الخصوصية.</li>
              <li><strong>Supabase:</strong> لتخزين بيانات الطلب.</li>
              <li><strong>Vercel:</strong> لاستضافة الموقع وواجهة البرمجة.</li>
              <li><strong>Upstash:</strong> للحد من إساءة استخدام الخدمة.</li>
              <li><strong>مزودو إشعارات الدفع:</strong> لإرسال إشعارات الطلب إلى الأجهزة المسجلة.</li>
              <li><strong>طابعة المطبخ:</strong> لطباعة المعلومات اللازمة لتحضير الطلب.</li>
            </ul>
            <p>قد تعالج بعض الجهات بيانات خارج الاتحاد الأوروبي/المنطقة الاقتصادية الأوروبية. يجب توثيق آلية النقل والضمانات المناسبة لكل خدمة قبل هذا النقل. يمكنك التواصل معنا لطلب المعلومات الحالية.</p>
          </section>

          <section className="legal-section">
            <h2>5. فترة الاحتفاظ بالبيانات (Lagringstid)</h2>
            <p>
              نحتفظ بمعلومات التسليم والملاحظات التشغيلية والتعديلات النصية لمدة تصل إلى <strong>90 يوماً</strong> بعد إغلاق الطلب. نحتفظ بالاسم ورقم الهاتف والبريد الإلكتروني لمدة تصل إلى <strong>3 سنوات</strong> لخدمة العملاء والشكاوى والنزاعات، ثم نخفي هويتها. تُحفظ السجلات المالية والمحاسبية المطلوبة وفقاً لفترة السبع سنوات القانونية. لا تسري عملية الحذف على طلب محدد أثناء وجود تعليق قانوني موثق.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. حقوقك (Dina rättigheter)</h2>
            <p>بموجب قانون GDPR، لديك الحقوق التالية:</p>
            <ul>
              <li>الحصول على نسخة من بياناتك (Registerutdrag).</li>
              <li>تصحيح أي بيانات غير دقيقة (Rättelse).</li>
              <li>طلب حذف بياناتك (Radering / "الحق في النسيان") بشرط عدم تعارضها مع قوانين المحاسبة.</li>
              <li>طلب تقييد المعالجة أو الاعتراض عليها.</li>
              <li>الحصول على البيانات القابلة للنقل عندما تنطبق الشروط القانونية.</li>
              <li>تقديم شكوى إلى الهيئة السويدية لحماية الخصوصية (IMY - Integritetsskyddsmyndigheten) عبر <a href="https://www.imy.se" target="_blank" rel="noopener noreferrer">www.imy.se</a>.</li>
            </ul>
            <p>بيانات الاتصال والتسليم المطلوبة في صفحة الدفع ضرورية لتنفيذ الطلب. إذا لم تقدمها، فلن نتمكن من إتمام الطلب أو تسليمه.</p>
          </section>

          <section className="legal-section">
            <h2>7. ملفات تعريف الارتباط والتخزين المحلي</h2>
            <p>لا نستخدم ملفات تعريف ارتباط للإعلانات أو التحليلات، ولا نحمل خرائط أو خطوطاً من أطراف ثالثة تلقائياً. رابط Google Maps لا يفتح إلا بعد نقر المستخدم.</p>
            <ul>
              <li><strong>سلة التسوق:</strong> تخزين محلي لمدة أقصاها 30 يوماً من آخر تغيير.</li>
              <li><strong>اللغة:</strong> تخزين محلي لمدة أقصاها 365 يوماً من آخر اختيار.</li>
              <li><strong>نوع الطلب ورمز حالة الطلب:</strong> تخزين خاص بعلامة التبويب حتى إغلاقها.</li>
              <li><strong>جلسة الإدارة وحماية CSRF:</strong> ملفا ارتباط ضروريان لمدة 30 دقيقة، ويُحذفان عند تسجيل الخروج.</li>
              <li><strong>إعدادات الطابعة والتنبيه:</strong> إعدادات خاصة بواجهة الإدارة لمدة أقصاها 365 يوماً.</li>
            </ul>
            <p>تُحذف القيم المنتهية أو غير الصالحة تلقائياً. يمكنك أيضاً حذف بيانات الموقع من إعدادات المتصفح في أي وقت.</p>
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
          <p><strong>Version 2.2 – effective 19 August 2026.</strong></p>

          <section className="legal-section">
            <h2>1. Data Controller</h2>
            <p>
              The data controller responsible for your personal data is:<br />
              <strong>Mormors Kunafa Aktiebolag</strong><br />
              Company registration number: 559424-4823<br />
              VAT registration number: SE559424482301<br />
              Address: Karolingatan 1, 212 34 Malmö, Sweden<br />
              Email: Mormorskunafa@gmail.com<br />
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
              <li><strong>Customer service, complaints and disputes (Legitimate Interest - Art. 6.1 f GDPR):</strong> To retain limited contact details linked to an order so we can locate and handle previous purchases during the complaint period.</li>
              <li><strong>Security & Improvements (Legitimate Interest - Art. 6.1 f GDPR):</strong> To prevent fraud and abuse.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. Recipients and Service Providers</h2>
            <p>We do not sell your personal data. We share only the data necessary with recipients that help us provide the service:</p>
            <ul>
              <li><strong>Stripe and Swish:</strong> Payment processing.</li>
              <li><strong>Resend and Sinch:</strong> Order emails and SMS notifications.</li>
              <li><strong>Google Gmail:</strong> Receipt of customer-service, complaint and privacy requests.</li>
              <li><strong>Supabase:</strong> Order database hosting.</li>
              <li><strong>Vercel:</strong> Website and API hosting.</li>
              <li><strong>Upstash:</strong> Abuse prevention and request rate limiting.</li>
              <li><strong>Push notification providers:</strong> Delivery of order notifications to registered devices.</li>
              <li><strong>Kitchen printer:</strong> Local printing of the details needed to prepare an order.</li>
            </ul>
            <p>Some providers may process data outside the EU/EEA. The applicable transfer mechanism and safeguards must be documented for each service before such a transfer. Contact us to request current information.</p>
          </section>

          <section className="legal-section">
            <h2>5. Data Retention</h2>
            <p>
              Delivery details, operational notes and free-text modifications are retained for up to <strong>90 days</strong> after an order reaches a terminal state. Name, phone number and email are retained for up to <strong>3 years</strong> for customer service, complaints and disputes, and are then anonymised. Required financial and accounting records are retained for the statutory seven-year period. A documented legal hold pauses deletion only for the affected order.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Your GDPR Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Request access to your personal data (Register extract).</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request erasure of your data ("right to be forgotten"), subject to statutory retention obligations.</li>
              <li>Request restriction of processing or object to processing.</li>
              <li>Receive portable data where the statutory requirements apply.</li>
              <li>Lodge a complaint with the Swedish Authority for Privacy Protection (IMY) via <a href="https://www.imy.se" target="_blank" rel="noopener noreferrer">www.imy.se</a>.</li>
            </ul>
            <p>The contact and delivery details marked as required at checkout are necessary to fulfil the order. Without them, we cannot complete or deliver the order.</p>
          </section>

          <section className="legal-section">
            <h2>7. Cookies and Local Storage</h2>
            <p>We use no advertising or analytics cookies and do not automatically load third-party maps or fonts. Google Maps opens only after you follow an ordinary external link.</p>
            <ul>
              <li><strong>Shopping cart:</strong> Local storage for no more than 30 days from the latest cart change.</li>
              <li><strong>Language:</strong> Local storage for no more than 365 days from the latest selection.</li>
              <li><strong>Order type and order-status token:</strong> Tab-only session storage until the tab is closed.</li>
              <li><strong>Admin session and CSRF protection:</strong> Two strictly necessary 30-minute cookies, deleted on logout.</li>
              <li><strong>Printer and alarm preferences:</strong> Admin-only settings for no more than 365 days.</li>
            </ul>
            <p>Expired or invalid values are removed automatically. You can also delete site data in your browser settings at any time.</p>
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
        <p><strong>Version 2.2 – gäller från och med 19 augusti 2026.</strong></p>

        <section className="legal-section">
          <h2>1. Personuppgiftsansvarig</h2>
          <p>
            Personuppgiftsansvarig för behandlingen av dina personuppgifter är:<br />
            <strong>Mormors Kunafa Aktiebolag</strong><br />
            Organisationsnummer: 559424-4823<br />
            Momsregistreringsnummer: SE559424482301<br />
            Adress: Karolingatan 1, 212 34 Malmö<br />
            E-post: Mormorskunafa@gmail.com<br />
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
            <li><strong>Bokföring och redovisning (Rättslig förpliktelse - Art 6.1 c GDPR):</strong> Vi är enligt den svenska <strong>Bokföringslagen (1999:1078)</strong> skyldiga att spara nödvändiga ekonomiska underlag under den lagstadgade sjuårsperioden.</li>
            <li><strong>Kundservice, reklamationer och tvister (Berättigat intresse - Art 6.1 f GDPR):</strong> Vi sparar begränsade kontaktuppgifter och kopplingen till ordern för att kunna hitta och hantera tidigare köp under reklamationsperioden.</li>
            <li><strong>Säkerhet och missbruksförebyggande (Berättigat intresse - Art 6.1 f GDPR):</strong> För att skydda våra system mot missbruk och bedrägerier.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Mottagare och tjänsteleverantörer</h2>
          <p>Vi säljer inte dina personuppgifter. Vi delar endast de uppgifter som behövs med mottagare som hjälper oss att genomföra tjänsten:</p>
          <ul>
            <li><strong>Stripe och Swish:</strong> För betalningshantering.</li>
            <li><strong>Resend och Sinch:</strong> För ordermejl och SMS-aviseringar.</li>
            <li><strong>Google Gmail:</strong> För att ta emot kundservice-, reklamations- och integritetsärenden.</li>
            <li><strong>Supabase:</strong> För lagring av orderuppgifter.</li>
            <li><strong>Vercel:</strong> För drift av webbplats och API.</li>
            <li><strong>Upstash:</strong> För missbruksskydd och anropsbegränsning.</li>
            <li><strong>Pushleverantörer:</strong> För att leverera ordernotiser till registrerade enheter.</li>
            <li><strong>Köksskrivare:</strong> För lokal utskrift av de uppgifter som behövs för att förbereda en order.</li>
          </ul>
          <p>
            Vissa leverantörer kan behandla uppgifter utanför EU/EES. Tillämplig överföringsmekanism och skyddsåtgärd måste dokumenteras för varje tjänst innan en sådan överföring sker. Kontakta oss för aktuell information.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Hur länge sparar vi dina uppgifter?</h2>
          <p>
            Leveransuppgifter, operativa anteckningar och produktanpassningar i fritext sparas i högst <strong>90 dagar</strong> efter att ordern har avslutats.
            Namn, telefonnummer och e-postadress sparas i högst <strong>3 år</strong> för kundservice, reklamationer och tvister och anonymiseras därefter.
            Nödvändiga ekonomiska underlag och bokföringsposter sparas under den lagstadgade sjuårsperioden. En dokumenterad legal hold pausar gallringen endast för den berörda ordern.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Dina rättigheter enligt GDPR</h2>
          <p>Du har rätt att:</p>
          <ul>
            <li>Begära ett <strong>registerutdrag</strong> över vilka personuppgifter vi behandlar om dig.</li>
            <li>Begära <strong>rättelse</strong> av felaktiga eller ofullständiga uppgifter.</li>
            <li>Begära <strong>radering</strong> ("rätten att bli bortglömd") av dina uppgifter i den mån det inte strider mot Bokföringslagens lagkrav.</li>
            <li>Begära <strong>begränsning</strong> av behandlingen eller <strong>invända</strong> mot behandling.</li>
            <li>Få ut uppgifter i ett portabelt format när förutsättningarna för <strong>dataportabilitet</strong> är uppfyllda.</li>
            <li>Lämna klagomål till tillsynsmyndigheten <strong>Integritetsskyddsmyndigheten (IMY)</strong> om du anser att vi behandlar dina personuppgifter i strid med GDPR (<a href="https://www.imy.se" target="_blank" rel="noopener noreferrer">www.imy.se</a>).</li>
          </ul>
          <p>
            Kontakt- och leveransuppgifter som markeras som obligatoriska i kassan behövs för att fullgöra beställningen. Om de inte lämnas kan vi inte genomföra eller leverera ordern.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Kakor och lokal lagring</h2>
          <p>Vi använder inga reklam- eller analyskakor och laddar inte automatiskt kartor eller typsnitt från tredje part. Google Maps öppnas endast när du följer en vanlig extern länk.</p>
          <ul>
            <li><strong>Varukorg:</strong> Lokal lagring i högst 30 dagar från den senaste ändringen.</li>
            <li><strong>Språk:</strong> Lokal lagring i högst 365 dagar från det senaste valet.</li>
            <li><strong>Ordertyp och orderstatustoken:</strong> Sessionslagring för den aktuella fliken tills den stängs.</li>
            <li><strong>Adminsession och CSRF-skydd:</strong> Två strikt nödvändiga 30-minuterskakor som raderas vid utloggning.</li>
            <li><strong>Skrivar- och larminställningar:</strong> Endast i admin, i högst 365 dagar.</li>
          </ul>
          <p>Utgångna eller ogiltiga värden raderas automatiskt. Du kan också när som helst radera webbplatsdata i webbläsarens inställningar.</p>
        </section>
      </div>
    </div>
  );
};
