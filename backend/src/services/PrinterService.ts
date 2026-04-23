import { CharacterSet, ThermalPrinter, PrinterTypes, BreakLine } from 'node-thermal-printer';

export class PrinterService {
  private printer: ThermalPrinter;

  constructor(printerIp: string) {
    // Definiera skrivaren och anslut via IP till den (EPSON ESC/POS används av Sunmi-nätverks/cloud-skrivare)
    this.printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${printerIp}`,
      characterSet: CharacterSet.PC865_NORDIC,
      removeSpecialCharacters: false,
      lineCharacter: "-",
      breakLine: BreakLine.WORD,
      options: {
        timeout: 5000 // Ge upp efter 5 sekunder om skrivaren inte svarar
      }
    });
  }

  /**
   * Kontrollerar om vi kan nå Sunmi-skrivaren via nätverket.
   */
  public async isConnected(): Promise<boolean> {
    try {
      return await this.printer.isPrinterConnected();
    } catch {
      return false;
    }
  }

  /**
   * Skriver ut en kökslapp med bara det köket behöver veta (inga priser).
   * Används automatiskt när admin accepterar en order.
   */
  public async printKitchenTicket(order: any): Promise<boolean> {
    try {
      const connected = await this.isConnected();
      if (!connected) {
        console.error("Kunde inte ansluta till skrivaren. Kontrollera nätverk/IP.");
        return false;
      }

      this.printer.clear();

      // -- HEADER --
      this.printer.alignCenter();
      this.printer.setTextSize(1, 1);
      this.printer.bold(true);
      this.printer.println("KOKSLAPP");
      this.printer.bold(false);
      this.printer.setTextNormal();
      this.printer.println(new Date().toLocaleString('sv-SE'));
      this.printer.newLine();

      // -- ORDERINFO --
      this.printer.alignLeft();
      this.printer.bold(true);
      this.printer.println(`Order: #${order.orderNumber || order.id || 'N/A'}`);
      if (order.customerInfo?.name) {
        this.printer.println(`Kund: ${order.customerInfo.name}`);
      }
      this.printer.bold(false);

      const orderTypeLabels: Record<string, string> = {
        'eat-here': 'Ata har',
        'takeaway': 'Ta med',
        'delivery': 'Hemleverans',
      };
      this.printer.println(`Typ: ${orderTypeLabels[order.orderType] || order.orderType || 'Okand'}`);

      if (order.estimatedReadyTime) {
        const ready = new Date(order.estimatedReadyTime);
        this.printer.println(`Fardig: ${ready.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`);
      }

      this.printer.drawLine();

      // -- PRODUKTER (utan pris) --
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          this.printer.println(`${item.quantity || 1}x ${item.productName || 'Okand produkt'}`);
          if (item.modifications && Array.isArray(item.modifications) && item.modifications.length > 0) {
            item.modifications.forEach((mod: string) => {
              this.printer.println(`   - ${mod}`);
            });
          }
        });
      }

      this.printer.drawLine();

      // -- LEVERANSINFO (om hemleverans) --
      if (order.orderType === 'delivery' && order.deliveryInfo) {
        this.printer.newLine();
        this.printer.bold(true);
        this.printer.println("Leveransinfo:");
        this.printer.bold(false);
        if (order.deliveryInfo.address) this.printer.println(order.deliveryInfo.address);
        if (order.deliveryInfo.postalCode || order.deliveryInfo.city) {
          this.printer.println(`${order.deliveryInfo.postalCode || ''} ${order.deliveryInfo.city || ''}`.trim());
        }
        if (order.deliveryInfo.phone) this.printer.println(`Tel: ${order.deliveryInfo.phone}`);
        this.printer.drawLine();
      }

      this.printer.newLine();
      this.printer.cut();
      this.printer.beep();

      await this.printer.execute();
      console.log(`[PrinterService] Skrev ut kokslapp for order #${order.orderNumber || order.id}`);

      return true;

    } catch (error) {
      console.error("[PrinterService] Fel vid utskrift av kokslapp:", error);
      return false;
    }
  }

  /**
   * Skriver ut ett kundkvitto med priser och totalsumma.
   * Används vid manuell utskrift via "Kvitto"-knappen.
   */
  public async printOrder(order: any): Promise<boolean> {
    try {
      const connected = await this.isConnected();
      if (!connected) {
        console.error("Kunde inte ansluta till skrivaren. Kontrollera nätverk/IP.");
        return false;
      }

      // Rensa eventuell gammal data
      this.printer.clear();

      // -- KVITTO HEADER --
      this.printer.alignCenter();
      this.printer.setTextSize(1, 1);
      this.printer.bold(true);
      this.printer.println("Mormors Kunafa");
      
      this.printer.setTextNormal();
      this.printer.println("Order-Kvitto");
      this.printer.println(new Date().toLocaleString('sv-SE'));
      this.printer.newLine();
      
      // -- ORDERINFO --
      this.printer.alignLeft();
      this.printer.bold(false);
      this.printer.println(`Order ID: #${order.id || 'N/A'}`);
      this.printer.drawLine(); // Ritad linje ---------

      // -- PRODUKTER --
      // Byt ut logiken nedan så den matchar vad du har i dina order items
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const quantityRow = `${item.quantity || 1}x ${item.productName || 'Okänd produkt'}`;
          const priceRow = `${(item.price * item.quantity / 100).toFixed(2) || 0} kr`;
          // leftRight formaterar automatiskt priset längst till höger
          this.printer.leftRight(quantityRow, priceRow);
        });
      }
      
      this.printer.drawLine();
      
      // -- TOTALPRIS --
      this.printer.bold(true);
      this.printer.leftRight("Totalt:", `${order.totalPrice / 100 || 0} kr`);
      this.printer.bold(false);
      this.printer.newLine();
      this.printer.newLine();

      // -- AVSLUTNING --
      this.printer.alignCenter();
      this.printer.println("Tack för din beställning!");
      this.printer.newLine();
      this.printer.newLine();
      
      // Skär av papperet (om skrivaren har sax)
      this.printer.cut();
      // Pip! (Smidigt i kök/kassa)
      this.printer.beep();
      
      // Genomför utskriften – skickar all vår formaterade text ovan till skrivaren
      await this.printer.execute();
      console.log(`[PrinterService] Skrev ut kvitto för order #${order.id}`);

      return true;

    } catch (error) {
      console.error("[PrinterService] Fel vid utskrift:", error);
      return false;
    }
  }
}
