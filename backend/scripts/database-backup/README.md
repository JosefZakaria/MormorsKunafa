# Lokal databasbackup

Windows PowerShell 5.1 och PostgreSQL 17-klientverktyg. Den här fristående lösningen ändrar inte hemsidans kod eller data i Supabase.

## Aktuell plats på den här datorn

Installationen är flyttad till `C:\Users\Admin\Desktop\Jobb\MormorsKunafa\MormorsKunafaBackup`. Hela undermappen undantas från Git, både i projektets `.gitignore` och i den lokala `.git/info/exclude` som gäller över branchbyten. Inställningar och kvällsjobb använder den nya platsen. Vid en återupptagen installation anges samma sökväg med `-InstallRoot`.

## Körning

- Varje kväll **21.30 enligt datorns Stockholm-tidszon**, inklusive sommartid.
- Missad körning tas igen vid nästa Windows-inloggning när nätverk finns. En låst, inloggad dator kan köra jobbet. En avstängd dator tar inga backuper; en senare körning sparar läget vid den faktiska exporten.
- Windows får försöka igen var femte minut, högst tolv gånger. Samtidiga körningar tillåts inte.
- De **14 senaste lyckade kopiorna** behålls. Ingen äldre kopia gallras om export eller kryptering misslyckas.

## Installation på den här datorn

Kör `Setup-DatabaseBackup.ps1` i Windows PowerShell med sökvägarna till PostgreSQLs `bin`-mapp och Supabases CA-certifikat som parametrarna `-PostgresBin` och `-CaCertificate`. Användaren anger databaslösenordet och väljer ett separat återställningslösenord i det lokala fönstret. Inga lösenord anges i kommandoraden eller sparas i Git.

Utan `-InstallRoot` installeras program, inställningar och krypterade kopior i `%LOCALAPPDATA%\MormorsKunafaBackup`, utanför projektet. Den aktuella flyttade installationen beskrivs ovan. Bara det aktuella Windows-kontot får ärvda filbehörigheter. Databaslösenordet skyddas med Windows DPAPI. Uppgiften registreras först efter en lyckad export, krypteringskontroll och kontroll av den exporterade återställningsnyckeln. Inget Windows-lösenord sparas; användaren måste vara inloggad.

En redan schemalagd uppgift skrivs inte över automatiskt. Vid en avbruten installation kan samma installationskommando köras igen: ange databaslösenordet på nytt och använd det tidigare valda återställningslösenordet. Den befintliga nyckeln bevaras.

## Kontrollera resultatet

I installationsmappen visar `status.json` senaste försöket, senaste lyckade backupen, filnamnet och SHA-256. Endast `Result: success` betyder en lyckad backup. `LastSuccess` ska vara från senaste kvällen eller en senare återhämtning. Se också uppgiften `MormorsKunafa-DatabaseBackup` i Windows Schemaläggaren. Returer: `0` lyckad eller ännu inte förfallen; `1` misslyckad. Kontrollera status regelbundet; ingen extern felavisering skickas.

Krypterade filer finns i `Backups`. Kopiera regelbundet en sådan fil och `RECOVERY-KEY.pfx` till separat lagring på annan plats. Förvara återställningslösenordet separat, exempelvis i er lösenordshanterare. En enda kopia på datorn skyddar inte mot datorhaveri. Nyckelfilen behövs om Windows-installationen eller datorn försvinner.

## Återställning

Kör `Recover-DatabaseBackup.ps1` med `-BackupFile`, `-RecoveryKeyFile` och en ny `-OutputDirectory`. Lösenordet efterfrågas lokalt. Skriptet dekrypterar till en privat mapp och **ansluter inte till någon databas**.

Arkivet innehåller:

- `database.dump`: databasens schema, data, sekvenser, funktioner, ägare och ACL/RLS-definitioner i PostgreSQLs custom-format.
- `roles.sql`: rolldefinitioner utan databasrollernas lösenord.
- `manifest.json`: tidpunkt och omfattning.

`pg_restore --list database.dump` visar innehållet. Återställ alltid först till en separat, kompatibel testmiljö. Ett nytt Supabase-projekt har redan plattformsroller och hanterade scheman; återspela inte alla roll-/schemaobjekt blint ovanpå dessa. Följ Supabases återställningsanvisningar för rätt målmiljö. Själva återställningen till produktion är aldrig automatisk.

## Omfattning och begränsningar

Backupen omfattar databasen, inte de faktiska filerna i Supabase Storage, Vercels miljövariabler eller andra leverantörer. Supabase Vault/pgsodium-kryptering kan kräva en separat projektnyckel. Vid återställning behöver även gallringsregler och återkallade adminsessioner hanteras innan driften öppnas igen. En daglig backup kan förlora nya order sedan senaste lyckade körningen.

Tester med syntetiska data: `powershell.exe -NoProfile -File backend/tests/database-backup.test.ps1 -PostgresBin <bin-mapp>`.
