import { CharacterSet, ThermalPrinter, PrinterTypes, BreakLine } from 'node-thermal-printer';

export class PrinterService {
  private printer: ThermalPrinter;

  constructor(printerIp: string) {
    // Definiera skrivaren och anslut via IP till den (EPSON ESC/POS används av Sunmi-nätverks/cloud-skrivare)
    this.printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: `tcp://${printerIp}`,
      characterSet: CharacterSet.SWEDEN,
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
   * Huvudmetoden för att skriva ut en order som ett kvitto.
   * Modifera den här utifrån hur din Order-typ ser ut!
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
          const quantityRow = `${item.quantity || 1}x ${item.name || 'Okänd produkt'}`;
          const priceRow = `${(item.price * item.quantity).toFixed(2) || 0} kr`;
          // leftRight formaterar automatiskt priset längst till höger
          this.printer.leftRight(quantityRow, priceRow);
        });
      }
      
      this.printer.drawLine();
      
      // -- TOTALPRIS --
      this.printer.bold(true);
      this.printer.leftRight("Totalt:", `${order.totalAmount || 0} kr`);
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
