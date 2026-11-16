import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import '../Terms/Terms.css';
import { openConsentSettings } from '../../consent/consent';

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
          <p><strong>الإصدار 2.4 – آخر تحديث في 16 نوفمبر 2026.</strong></p>

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
              <li><strong>معلومات الدفع:</strong> المبلغ وطريقة الدفع وحالته ومرجع عملية الدفع. تُدخل بيانات البطاقة لدى Stripe ولا تُحفظ في قاعدة بيانات الطلبات لدينا.</li>
              <li><strong>مراسلات خدمة العملاء:</strong> المعلومات التي ترسلها إلينا عند التواصل بشأن طلب أو شكوى أو حقوقك المتعلقة بالبيانات.</li>
              <li><strong>البيانات التقنية:</strong> عنوان IP، نوع المتصفح، وسجلات الجلسة.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>3. الغرض والأساس القانوني للمعالجة (Ändamål och Rättslig Grund)</h2>
            <ul>
              <li><strong>إتمام الطلبات والخدمة (تنفيذ العقد - Art 6.1 b GDPR):</strong> لمعالجة الطلب، وتجهيز الحلويات، وإرسال رسائل التجميع والتوصيل عبر SMS أو البريد الإلكتروني.</li>
              <li><strong>الالتزام بالقوانين المحاسبية (التزام قانوني - Art 6.1 c GDPR):</strong> حفظ المستندات المحاسبية الضرورية وفقاً لقانون المحاسبة السويدي (Bokföringslagen 1999:1078).</li>
              <li><strong>خدمة العملاء والشكاوى والنزاعات (المصلحة المشروعة - Art 6.1 f GDPR):</strong> للاحتفاظ ببيانات اتصال محدودة وربطها بالطلب حتى نتمكن من العثور على المشتريات السابقة ومعالجة الشكاوى خلال مدتها القانونية.</li>
              <li><strong>تحسين الخدمة والأمان (المصلحة المشروعة - Art 6.1 f GDPR):</strong> لحماية الموقع من الاحتيال ومنع سوء الاستخدام.</li>
              <li><strong>التفضيلات الاختيارية والخرائط (الموافقة - Art 6.1 a GDPR):</strong> لتذكّر اختياراتك بين الزيارات وتحميل خرائط Google عندما تسمح بذلك في إعدادات ملفات تعريف الارتباط.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. الجهات المستلمة ومقدمو الخدمات (Mottagare och leverantörer)</h2>
            <p>نحن لا نبيع أو نؤجر بياناتك الشخصية لأي طرف ثالث. نشارك فقط البيانات اللازمة مع الجهات التي تساعد في تنفيذ الخدمة:</p>
            <ul>
              <li><strong>Stripe:</strong> لمعالجة المدفوعات بالبطاقة باستخدام معلومات الطلب والمبلغ والبريد الإلكتروني. يعالج Stripe بيانات البطاقة مباشرة، وقد يكون مسؤولاً مستقلاً عن بعض المعالجات، مثل منع الاحتيال والالتزامات القانونية.</li>
              <li><strong>Resend:</strong> لإرسال تأكيدات الطلب والإيصالات باستخدام البريد الإلكتروني والاسم ومعلومات الطلب.</li>
              <li><strong>Sinch:</strong> لإرسال إشعارات SMS باستخدام رقم الهاتف ونص الإشعار.</li>
              <li><strong>Google Gmail:</strong> لاستقبال طلبات العملاء والشكاوى وطلبات الخصوصية.</li>
              <li><strong>Supabase:</strong> لتخزين الطلبات وحسابات الموظفين وجلسات الإدارة وبيانات الحد من إساءة الاستخدام. توجد قاعدة البيانات الأساسية في فرانكفورت بألمانيا، داخل الاتحاد الأوروبي.</li>
              <li><strong>Vercel:</strong> لاستضافة الموقع وواجهة البرمجة ومعالجة الطلبات التقنية وبيانات الأمان.</li>
              <li><strong>Google Maps:</strong> لعرض الخرائط بعد موافقتك فقط، وعندها قد يتلقى Google عنوان IP وبيانات المتصفح.</li>
              <li><strong>مزودو إشعارات الدفع:</strong> لإرسال مراجع الطلبات إلى أجهزة الموظفين المسجلة باستخدام بيانات الاشتراك التقنية.</li>
              <li><strong>طابعة المطبخ:</strong> لطباعة المعلومات اللازمة لتحضير الطلب.</li>
            </ul>
            <p>يخزّن Resend بيانات البريد الإلكتروني في الولايات المتحدة، وتستخدم إشعارات SMS منطقة Sinch الأمريكية. وقد تشمل خدمات الدعم والجهات الفرعية لدى مزودين آخرين معالجة خارج الاتحاد الأوروبي/المنطقة الاقتصادية الأوروبية أيضاً.</p>
            <p>تخضع هذه التحويلات لمتطلبات الفصل الخامس من GDPR. تتضمن شروط حماية البيانات المنشورة لدى <a href="https://resend.com/security/gdpr" target="_blank" rel="noopener noreferrer">Resend</a> و<a href="https://supabase.com/legal/customer-resources/data-processing-addendum" target="_blank" rel="noopener noreferrer">Supabase</a> و<a href="https://vercel.com/legal/dpa" target="_blank" rel="noopener noreferrer">Vercel</a> و<a href="https://sinch.com/legal/terms-and-conditions/other-sinch-terms-conditions/data-processing-agreement/" target="_blank" rel="noopener noreferrer">Sinch</a> البنود التعاقدية القياسية للاتحاد الأوروبي (SCC). يوضح <a href="https://stripe.com/legal/dta" target="_blank" rel="noopener noreferrer">Stripe</a> و<a href="https://policies.google.com/privacy/frameworks" target="_blank" rel="noopener noreferrer">Google</a> ترتيبات التحويل الخاصة بهما في شروطهما. تواصل معنا للحصول على معلومات أو نسخة من الضمانات المنطبقة على معالجة بياناتك.</p>
          </section>

          <section className="legal-section">
            <h2>5. فترة الاحتفاظ بالبيانات (Lagringstid)</h2>
            <p>
              تُحفظ المعلومات المحاسبية حتى نهاية السنة السابعة التي تلي نهاية السنة التقويمية التي انتهت خلالها السنة المالية المعنية. يشمل ذلك معلومات المعاملة وما يلزم منها لتحديد الطرف المقابل. ولا يعني ذلك وجوب حفظ جميع بيانات العملاء للمدة نفسها.
            </p>
            <p>تُحدّد مدة الاحتفاظ ببيانات الاتصال والتوصيل والمراسلات والملاحظات الأخرى وفقاً للحاجة إلى إتمام الطلب، ووقت إغلاق أي شكوى، ومدد التقادم المنطبقة على المطالبات القانونية. وقد يلزم الاحتفاظ بالبيانات المرتبطة بنزاع قائم حتى تسويته. كما تُقيّم الحاجة إلى السجلات التقنية وفقاً لغرض الأمان والتحقيق في الأعطال. لا يجوز الاحتفاظ بالبيانات لمدة أطول مما يلزم لغرضها أو لالتزام قانوني.</p>
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
            <p>لممارسة حقوقك، راسلنا على البريد الإلكتروني الوارد في القسم 1. نرد دون تأخير غير مبرر، وفي العادة خلال شهر من استلام الطلب. إذا سمحت GDPR بتمديد المدة بسبب تعقيد الطلب أو كثرة الطلبات، نبلغك خلال الشهر الأول بسبب التمديد. وقد نطلب معلومات إضافية ضرورية للتحقق من هويتك عند وجود شك معقول.</p>
          </section>

          <section className="legal-section">
            <h2>7. ملفات تعريف الارتباط والتخزين المحلي</h2>
            <p>تخضع ملفات تعريف الارتباط والتخزين المشابه لقانون الاتصالات الإلكترونية السويدي (LEK، الفصل 9 المادة 28). يتطلب التخزين غير الضروري موافقتك، بينما يُستثنى التخزين الضروري للخدمة التي طلبتها. نقرأ اختيارك المحفوظ لتطبيقه، ولا نحمّل الخرائط أو نحفظ التفضيلات بين الزيارات دون موافقتك. قبل اختيارك الأول تبقى بيانات الطلب في ذاكرة الصفحة. لا نستخدم ملفات تعريف ارتباط للإعلانات أو التحليلات.</p>
            <ul>
              <li><strong>ضرورية (بعد اختيارك):</strong> اختيارك نفسه (<code>mk-consent</code>، لمدة 12 شهراً)، وبيانات الطلب مثل نوع الطلب والمطعم وسلة التسوق في تخزين الجلسة الخاص بعلامة التبويب، ويُحذف عند إغلاقها.</li>
              <li><strong>التفضيلات (بموافقتك فقط):</strong> اللغة وسلة التسوق في التخزين المحلي حتى تتذكرها في زيارتك القادمة، لمدة أقصاها 12 شهراً.</li>
              <li><strong>المحتوى الخارجي – Google Maps (بموافقتك فقط):</strong> الخرائط المضمّنة تُحمَّل من Google التي قد تضع ملفات تعريف ارتباط خاصة بها وتتلقى عنوان IP. انظر سياسة خصوصية Google.</li>
              <li><strong>واجهة الإدارة (للموظفين فقط):</strong> ملف جلسة ضروري لتسجيل الدخول صالح لمدة أقصاها 16 ساعة، وإعدادات الطابعة والتنبيه اللازمة للعمل.</li>
            </ul>
            <p>يمكنك سحب موافقتك أو تغييرها في أي وقت، وعندها نحذف البيانات المحفوظة التي لم تعد مسموحة. يُطلب اختيارك مجدداً بعد 12 شهراً.</p>
            <p><button type="button" className="legal-consent-btn" onClick={openConsentSettings}>إعدادات ملفات تعريف الارتباط</button></p>
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
          <p><strong>Version 2.4 – last updated 16 November 2026.</strong></p>

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
              <li><strong>Payment information:</strong> Amount, payment method, payment status and payment reference. Card details are entered with Stripe and are not stored in our order database.</li>
              <li><strong>Customer correspondence:</strong> Information you send us about an order, complaint or your data protection rights.</li>
              <li><strong>Technical data:</strong> IP address, browser type, device information.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>3. Purpose and Legal Basis for Processing</h2>
            <ul>
              <li><strong>Order Fulfillment (Performance of Contract - Art. 6.1 b GDPR):</strong> To process, prepare, deliver, and send SMS/email order updates.</li>
              <li><strong>Accounting Compliance (Legal Obligation - Art. 6.1 c GDPR):</strong> To retain necessary accounting records under the Swedish Bookkeeping Act (Bokföringslagen 1999:1078).</li>
              <li><strong>Customer service, complaints and disputes (Legitimate Interest - Art. 6.1 f GDPR):</strong> To retain limited contact details linked to an order so we can locate and handle previous purchases during the complaint period.</li>
              <li><strong>Security & Improvements (Legitimate Interest - Art. 6.1 f GDPR):</strong> To prevent fraud and abuse.</li>
              <li><strong>Optional preferences and maps (Consent - Art. 6.1 a GDPR):</strong> To remember choices between visits and load Google Maps when you allow this in the cookie settings.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. Recipients and Service Providers</h2>
            <p>We do not sell your personal data. We share only the data necessary with recipients that help us provide the service:</p>
            <ul>
              <li><strong>Stripe:</strong> Card payment processing using order details, amounts and email addresses. Stripe handles card details directly and may act as an independent controller for activities such as fraud prevention and legal obligations.</li>
              <li><strong>Resend:</strong> Order confirmations and receipts using email addresses, names and order details.</li>
              <li><strong>Sinch:</strong> SMS notifications using phone numbers and notification text.</li>
              <li><strong>Google Gmail:</strong> Receipt of customer-service, complaint and privacy requests.</li>
              <li><strong>Supabase:</strong> Storage of orders, staff accounts, admin sessions and abuse prevention data. The primary database is hosted in Frankfurt, Germany, within the EU.</li>
              <li><strong>Vercel:</strong> Website and API hosting, request processing and technical security data.</li>
              <li><strong>Google Maps:</strong> Maps loaded only with your consent, when Google may receive your IP address and browser information.</li>
              <li><strong>Push notification providers:</strong> Delivery of order references to registered staff devices using technical subscription information.</li>
              <li><strong>Kitchen printer:</strong> Local printing of the details needed to prepare an order.</li>
            </ul>
            <p>Resend stores email data in the United States, and SMS notifications use Sinch's US region. Support and subprocessors of other providers may also involve processing outside the EU/EEA.</p>
            <p>These transfers are subject to Chapter V of the GDPR. The published data protection terms of <a href="https://resend.com/security/gdpr" target="_blank" rel="noopener noreferrer">Resend</a>, <a href="https://supabase.com/legal/customer-resources/data-processing-addendum" target="_blank" rel="noopener noreferrer">Supabase</a>, <a href="https://vercel.com/legal/dpa" target="_blank" rel="noopener noreferrer">Vercel</a> and <a href="https://sinch.com/legal/terms-and-conditions/other-sinch-terms-conditions/data-processing-agreement/" target="_blank" rel="noopener noreferrer">Sinch</a> include the EU Standard Contractual Clauses (SCCs). <a href="https://stripe.com/legal/dta" target="_blank" rel="noopener noreferrer">Stripe</a> and <a href="https://policies.google.com/privacy/frameworks" target="_blank" rel="noopener noreferrer">Google</a> describe their transfer arrangements in their terms. Contact us for information or a copy of the safeguards applicable to your data.</p>
          </section>

          <section className="legal-section">
            <h2>5. Data Retention</h2>
            <p>
              Accounting records are retained until the end of the seventh year following the end of the calendar year in which the relevant financial year ended. This covers transaction information and the details needed to identify the counterparty. It does not mean that all customer data must be kept for the same period.
            </p>
            <p>Retention of other contact and delivery details, correspondence and notes is determined by the need to fulfil the order, when any complaint is closed and the applicable limitation periods for legal claims. Information relevant to an ongoing dispute may need to be retained until it is resolved. Technical logs are assessed according to their security and troubleshooting purposes. Data must not be kept longer than necessary for its purpose or a legal obligation.</p>
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
            <p>To exercise your rights, email the address in section 1. We respond without undue delay and normally within one month of receiving your request. If the GDPR permits an extension because of complexity or the number of requests, we notify you within the first month and explain why. Where we have reasonable doubts about your identity, we may request additional information necessary to verify it.</p>
          </section>

          <section className="legal-section">
            <h2>7. Cookies and Local Storage</h2>
            <p>Cookies and similar storage are governed by the Swedish Electronic Communications Act (LEK, chapter 9, section 28). Non-essential storage requires consent; storage strictly necessary for the service you request is exempt. We read your saved choice to apply it and do not load maps or remember preferences between visits without your consent. Before your first choice, order data stays in page memory. We use no advertising or analytics cookies.</p>
            <ul>
              <li><strong>Necessary (once you have chosen):</strong> Your choice itself (<code>mk-consent</code>, 12 months), plus order data such as order type, chosen restaurant and cart in tab-only session storage, deleted when the tab is closed.</li>
              <li><strong>Preferences (only with your consent):</strong> Language and cart in local storage so they are remembered on your next visit, for no more than 12 months.</li>
              <li><strong>External content – Google Maps (only with your consent):</strong> Embedded maps are loaded from Google, which may set its own cookies and receive your IP address. See Google's privacy policy.</li>
              <li><strong>Admin interface (staff only):</strong> A necessary login session cookie valid for up to 16 hours, plus printer and alarm settings needed for work.</li>
            </ul>
            <p>You can withdraw or change your consent at any time; we then delete stored data that is no longer allowed. You are asked again after 12 months.</p>
            <p><button type="button" className="legal-consent-btn" onClick={openConsentSettings}>Cookie settings</button></p>
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
        <p><strong>Version 2.4 – senast uppdaterad 16 november 2026.</strong></p>

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
            <li><strong>Betalningsinformation:</strong> Belopp, betalningsmetod, betalningsstatus och betalningsreferens. Kortuppgifter anges hos Stripe och sparas inte i vår orderdatabas.</li>
            <li><strong>Kundärenden:</strong> Uppgifter du skickar till oss om en order, reklamation eller dina dataskyddsrättigheter.</li>
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
            <li><strong>Frivilliga inställningar och kartor (Samtycke - Art 6.1 a GDPR):</strong> För att minnas val mellan besök och ladda Google Maps när du tillåter det i cookieinställningarna.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Mottagare och tjänsteleverantörer</h2>
          <p>Vi säljer inte dina personuppgifter. Vi delar endast de uppgifter som behövs med mottagare som hjälper oss att genomföra tjänsten:</p>
          <ul>
            <li><strong>Stripe:</strong> För kortbetalningar med hjälp av orderuppgifter, belopp och e-postadress. Stripe hanterar kortuppgifterna direkt och kan vara självständigt personuppgiftsansvarig för exempelvis bedrägeribekämpning och lagkrav.</li>
            <li><strong>Resend:</strong> För orderbekräftelser och kvitton med hjälp av e-postadress, namn och orderuppgifter.</li>
            <li><strong>Sinch:</strong> För SMS-aviseringar med hjälp av telefonnummer och aviseringstext.</li>
            <li><strong>Google Gmail:</strong> För att ta emot kundservice-, reklamations- och integritetsärenden.</li>
            <li><strong>Supabase:</strong> För lagring av order, personalkonton, adminsessioner och uppgifter för missbruksskydd. Primärdatabasen finns i Frankfurt, Tyskland, inom EU.</li>
            <li><strong>Vercel:</strong> För drift av webbplats och API, hantering av anrop och tekniska säkerhetsuppgifter.</li>
            <li><strong>Google Maps:</strong> För kartor som laddas först efter ditt samtycke. Google kan då ta emot IP-adress och webbläsaruppgifter.</li>
            <li><strong>Pushleverantörer:</strong> För att leverera orderreferenser till registrerade personalenheter med hjälp av tekniska prenumerationsuppgifter.</li>
            <li><strong>Köksskrivare:</strong> För lokal utskrift av de uppgifter som behövs för att förbereda en order.</li>
          </ul>
          <p>
            Resend lagrar mejluppgifter i USA och för SMS-aviseringar används Sinchs USA-region. Även andra leverantörers support och underleverantörer kan innebära behandling utanför EU/EES.
          </p>
          <p>Sådana överföringar omfattas av kraven i GDPR:s kapitel V. De publicerade dataskyddsvillkoren hos <a href="https://resend.com/security/gdpr" target="_blank" rel="noopener noreferrer">Resend</a>, <a href="https://supabase.com/legal/customer-resources/data-processing-addendum" target="_blank" rel="noopener noreferrer">Supabase</a>, <a href="https://vercel.com/legal/dpa" target="_blank" rel="noopener noreferrer">Vercel</a> och <a href="https://sinch.com/legal/terms-and-conditions/other-sinch-terms-conditions/data-processing-agreement/" target="_blank" rel="noopener noreferrer">Sinch</a> innehåller EU:s standardavtalsklausuler (SCC). <a href="https://stripe.com/legal/dta" target="_blank" rel="noopener noreferrer">Stripe</a> och <a href="https://policies.google.com/privacy/frameworks" target="_blank" rel="noopener noreferrer">Google</a> beskriver sina överföringsarrangemang i sina villkor. Kontakta oss för information eller en kopia av de skyddsåtgärder som gäller för behandlingen av dina uppgifter.</p>
        </section>

        <section className="legal-section">
          <h2>5. Hur länge sparar vi dina uppgifter?</h2>
          <p>
            Räkenskapsinformation sparas till och med det sjunde året efter utgången av det kalenderår då det aktuella räkenskapsåret avslutades. Det omfattar transaktionsuppgifter och de uppgifter som behövs för att identifiera motparten. Det innebär inte att samtliga kunduppgifter måste sparas lika länge.
          </p>
          <p>Lagringstiden för andra kontakt- och leveransuppgifter, kundärenden och anteckningar bedöms utifrån vad som behövs för att slutföra ordern, när en eventuell reklamation avslutas och tillämpliga preskriptionsfrister för rättsliga anspråk. Uppgifter som berör en pågående tvist kan behöva sparas tills den är avgjord. Behovet av tekniska loggar bedöms utifrån säkerhet och felsökning. Uppgifter får inte sparas längre än vad ändamålet eller en rättslig skyldighet kräver.</p>
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
          <p>För att utöva dina rättigheter, mejla adressen i avsnitt 1. Vi svarar utan onödigt dröjsmål och normalt inom en månad efter att vi har fått din begäran. Om GDPR medger förlängning på grund av ärendets komplexitet eller antalet begäranden meddelar vi dig inom den första månaden och förklarar varför. Vid rimligt tvivel om din identitet kan vi begära ytterligare uppgifter som behövs för att verifiera den.</p>
        </section>

        <section className="legal-section">
          <h2>7. Kakor och lokal lagring</h2>
          <p>Kakor och liknande lagring omfattas av lagen om elektronisk kommunikation (LEK, 9 kap. 28 §). Icke-nödvändig lagring kräver samtycke; lagring som är nödvändig för den tjänst du begär är undantagen. Vi läser ditt sparade val för att tillämpa det och laddar inte kartor eller sparar inställningar mellan besök utan ditt samtycke. Före ditt första val finns orderuppgifter i sidans minne. Vi använder inga reklam- eller analyskakor.</p>
          <ul>
            <li><strong>Nödvändiga (efter att du gjort ett val):</strong> Själva valet (<code>mk-consent</code>, 12 månader), samt orderuppgifter som ordertyp, vald restaurang och varukorg i sessionslagring för den aktuella fliken, som raderas när fliken stängs.</li>
            <li><strong>Inställningar (endast med samtycke):</strong> Språk och varukorg i lokal lagring så att de finns kvar vid nästa besök, i högst 12 månader.</li>
            <li><strong>Externt innehåll – Google Maps (endast med samtycke):</strong> Inbäddade kartor laddas från Google, som då kan sätta egna kakor och ta emot din IP-adress. Se Googles integritetspolicy.</li>
            <li><strong>Admingränssnitt (endast personal):</strong> En nödvändig sessionskaka för inloggning med högst 16 timmars giltighet samt skrivar- och larminställningar som behövs i arbetet.</li>
          </ul>
          <p>Du kan när som helst återkalla eller ändra ditt samtycke. Då raderar vi sparade uppgifter som inte längre är tillåtna. Du tillfrågas på nytt efter 12 månader.</p>
          <p><button type="button" className="legal-consent-btn" onClick={openConsentSettings}>Cookieinställningar</button></p>
        </section>
      </div>
    </div>
  );
};
