export type Language = 'sv' | 'en' | 'ar';

export const translations = {
    sv: {
        // Header
        "nav.hitta_hit": "HITTA HIT",
        "nav.meny": "MENY",
        "nav.cart": "VARUKORG",

        // Footer
        "footer.tagline": "Autentiska smaker, gjorda med kärlek.",
        "footer.copyright": "© 2024 Mormors Kunafa. Alla rättigheter förbehållna.",

        // Landing
        "landing.title": "Smaka på traditionen",
        "landing.subtitle": "Autentisk Kunafa gjord med kärlek.",
        "landing.eat_here": "Ät här",
        "landing.takeaway": "Ta med",
        "landing.delivery": "Hemkörning",
        "landing.view_menu": "Se hela menyn",

        // Find Us
        "findus.title": "Hitta till oss",
        "findus.address_title": "Adress",
        "findus.open_hours_title": "Öppettider",
        "findus.hours_week": "Mån - Fre: 11:00 - 20:00",
        "findus.hours_weekend": "Lör - Sön: 12:00 - 21:00",
        "findus.directions_btn": "Vägbeskrivning",

        // Menu
        "menu.title": "Vår Meny",
        "menu.subtitle": "Traditionella sötsaker, nybakade varje dag.",
        "menu.add_to_cart": "Lägg till",

        // Cart
        "cart.title": "Din Beställning",
        "cart.empty": "Din varukorg är tom",
        "cart.total": "Totalt",
        "cart.checkout": "Gå till betalning",

        // Common
        "loading": "Laddar...",
        "error": "Ett fel uppstod",

        // Products
        "products.1.name": "Pistage Baklawa",
        "products.1.desc": "Krispiga lager av filodeg fyllda med premium pistagenötter.",
        "products.2.name": "Walnut Baklawa",
        "products.2.desc": "Klassisk baklawa fylld med krossade valnötter.",
        "products.3.name": "Finmald Kunafa",
        "products.3.desc": "Len, finmald kunafa-deg med smält ost.",
        "products.4.name": "Kaake med Kunafa",
        "products.4.desc": "Sesambröd fylld med varm kunafa-ost.",
        "products.5.name": "Ashta Kunafa",
        "products.5.desc": "Klassisk mjuk kunafa med krämfyllning.",
        "products.6.name": "Harise med Ashta",
        "products.6.desc": "Söt mannagrynskaka toppad med färsk kräm.",
        "products.7.name": "Ostkaka (Halawet el Jibn)",
        "products.7.desc": "Söta ostrule fyllda med kräm.",
        "products.8.name": "Krispig Kunafa",
        "products.8.desc": "Grov kunafa-deg, krispig och gyllene.",

        // Delivery
        "delivery.title": "Hemkörning",
        "delivery.subtitle": "Var ska vi leverera?",
        "delivery.city_label": "Välj stad",
        "delivery.address_label": "Gatuadress",
        "delivery.submit_btn": "Se meny",
        "delivery.city_placeholder": "Välj...",
        "delivery.address_placeholder": "T.ex. Storgatan 1",
        "delivery.postal_code_label": "Postnummer",
        "delivery.postal_code_placeholder": "T.ex. 211 11",
        "delivery.phone_label": "Telefonnummer",
        "delivery.phone_placeholder": "T.ex. 070 123 45 67",
        "delivery.email_label": "E-post (frivilligt)",
        "delivery.email_placeholder": "namn@exempel.se",
        "cities.malmo": "Malmö",
        "cities.goteborg": "Göteborg",
        "cities.stockholm": "Stockholm",

        // Select Location
        "select_location.title": "Välj stad",
        "select_location.continue": "Fortsätt"
    },
    en: {
        // Header
        "nav.hitta_hit": "FIND US",
        "nav.meny": "MENU",
        "nav.cart": "CART",

        // Footer
        "footer.tagline": "Authentic flavors, made with love.",
        "footer.copyright": "© 2024 Mormors Kunafa. All rights reserved.",

        // Landing
        "landing.title": "Taste the Tradition",
        "landing.subtitle": "Authentic Kunafa made with love.",
        "landing.eat_here": "Eat Here",
        "landing.takeaway": "Takeaway",
        "landing.delivery": "Delivery",
        "landing.view_menu": "View Full Menu",

        // Find Us
        "findus.title": "Find Us",
        "findus.address_title": "Address",
        "findus.open_hours_title": "Opening Hours",
        "findus.hours_week": "Mon - Fri: 11:00 - 20:00",
        "findus.hours_weekend": "Sat - Sun: 12:00 - 21:00",
        "findus.directions_btn": "Get Directions",

        // Menu
        "menu.title": "Our Menu",
        "menu.subtitle": "Traditional sweets, baked fresh daily.",
        "menu.add_to_cart": "Add to Cart",

        // Cart
        "cart.title": "Your Order",
        "cart.empty": "Your cart is empty",
        "cart.total": "Total",
        "cart.checkout": "Checkout",

        // Common
        "loading": "Loading...",
        "error": "An error occurred",

        // Products
        "products.1.name": "Pistachio Baklawa",
        "products.1.desc": "Crispy layers of phyllo dough filled with premium pistachios.",
        "products.2.name": "Walnut Baklawa",
        "products.2.desc": "Classic baklawa filled with crushed walnuts.",
        "products.3.name": "Fine Kunafa",
        "products.3.desc": "Smooth, fine kunafa dough with melted cheese.",
        "products.4.name": "Kaake with Kunafa",
        "products.4.desc": "Sesame bread filled with warm kunafa cheese.",
        "products.5.name": "Ashta Kunafa",
        "products.5.desc": "Classic soft kunafa with cream filling.",
        "products.6.name": "Harise with Ashta",
        "products.6.desc": "Sweet semolina cake topped with fresh cream.",
        "products.7.name": "Sweet Cheese Rolls (Halawet el Jibn)",
        "products.7.desc": "Sweet cheese rolls filled with cream.",
        "products.8.name": "Crispy Kunafa",
        "products.8.desc": "Coarse kunafa dough, crispy and golden.",

        // Delivery
        "delivery.title": "Home Delivery",
        "delivery.subtitle": "Where should we deliver?",
        "delivery.city_label": "Select City",
        "delivery.address_label": "Street Address",
        "delivery.submit_btn": "View Menu",
        "delivery.city_placeholder": "Select...",
        "delivery.address_placeholder": "E.g. Main Street 1",
        "delivery.postal_code_label": "Postal Code",
        "delivery.postal_code_placeholder": "E.g. 211 11",
        "delivery.phone_label": "Phone Number",
        "delivery.phone_placeholder": "E.g. 070 123 45 67",
        "delivery.email_label": "Email (optional)",
        "delivery.email_placeholder": "name@example.com",
        "cities.malmo": "Malmö",
        "cities.goteborg": "Gothenburg",
        "cities.stockholm": "Stockholm",

        // Select Location
        "select_location.title": "Select City",
        "select_location.continue": "Continue"
    },
    ar: {
        // Header
        "nav.hitta_hit": "موقعنا",
        "nav.meny": "القائمة",
        "nav.cart": "السلة",

        // Footer
        "footer.tagline": "نكهات أصيلة، صُنعت بحب.",
        "footer.copyright": "© 2024 كنافة جدتي. جميع الحقوق محفوظة.",

        // Landing
        "landing.title": "تذوق التقاليد",
        "landing.subtitle": "كنافة أصيلة صُنعت بحب.",
        "landing.eat_here": "تناول الطعام هنا",
        "landing.takeaway": "خارجي",
        "landing.delivery": "توصيل",
        "landing.view_menu": "عرض القائمة الكاملة",

        // Find Us
        "findus.title": "موقعنا",
        "findus.address_title": "العنوان",
        "findus.open_hours_title": "ساعات العمل",
        "findus.hours_week": "الإثنين - الجمعة: 11:00 - 20:00",
        "findus.hours_weekend": "السبت - الأحد: 12:00 - 21:00",
        "findus.directions_btn": "الاتجاهات",

        // Menu
        "menu.title": "قائمتنا",
        "menu.subtitle": "حلويات تقليدية، تُخبز طازجة يومياً.",
        "menu.add_to_cart": "أضف للسلة",

        // Cart
        "cart.title": "طلبك",
        "cart.empty": "سلتك فارغة",
        "cart.total": "المجموع",
        "cart.checkout": "الدفع",

        // Common
        "loading": "جار التحميل...",
        "error": "حدث خطأ",

        // Products
        "products.1.name": "بقلاوة بالفستق",
        "products.1.desc": "طبقات مقرمشة من عجينة الفيلو محشوة بالفستق الفاخر.",
        "products.2.name": "بقلاوة بالجوز",
        "products.2.desc": "بقلاوة كلاسيكية محشوة بالجوز المطحون.",
        "products.3.name": "كنافة ناعمة",
        "products.3.desc": "عجينة كنافة ناعمة وسلسة مع جبنة سائحة.",
        "products.4.name": "كعكة بالكنافة",
        "products.4.desc": "خبز بالسمسم محشو بجبنة الكنافة الساخنة.",
        "products.5.name": "كنافة بالقشطة",
        "products.5.desc": "كنافة ناعمة كلاسيكية محشوة بالقشطة.",
        "products.6.name": "هريسة بالقشطة",
        "products.6.desc": "كعكة سميد حلوة تعلوها قشطة طازجة.",
        "products.7.name": "حلاوة الجبن",
        "products.7.desc": "لفائف جبنة حلوة محشوة بالقشطة.",
        "products.8.name": "كنافة خشنة",
        "products.8.desc": "عجينة كنافة خشنة، مقرمشة وذهبية.",

        // Delivery
        "delivery.title": "توصيل",
        "delivery.subtitle": "إلى أين التوصيل؟",
        "delivery.city_label": "اختر المدينة",
        "delivery.address_label": "العنوان",
        "delivery.submit_btn": "عرض القائمة",
        "delivery.city_placeholder": "اختر...",
        "delivery.address_placeholder": "مثال: شارع رئيسي 1",
        "delivery.postal_code_label": "الرمز البريدي",
        "delivery.postal_code_placeholder": "مثال: 211 11",
        "delivery.phone_label": "رقم الهاتف",
        "delivery.phone_placeholder": "مثال: 070 123 45 67",
        "delivery.email_label": "البريد الإلكتروني (اختياري)",
        "delivery.email_placeholder": "name@example.com",
        "cities.malmo": "مالمو",
        "cities.goteborg": "غوتنبرغ",
        "cities.stockholm": "ستوكهولم",

        // Select Location
        "select_location.title": "اختر المدينة",
        "select_location.continue": "استمر"
    }
};
