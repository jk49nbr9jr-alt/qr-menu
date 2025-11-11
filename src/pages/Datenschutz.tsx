export default function Datenschutz() {
  return (
    <div className="max-w-3xl mx-auto p-6 text-neutral-800 dark:text-neutral-100">
      <h1 className="text-2xl font-bold mb-4">Datenschutzerklärung</h1>
      <p>Diese Website speichert ausschließlich technisch notwendige Daten. 
         Es werden keine personenbezogenen Daten zu Marketingzwecken verarbeitet.</p>
      <ul className="list-disc pl-6 mt-3 space-y-2">
        <li>Es werden keine Tracking- oder Analyse-Cookies verwendet.</li>
        <li>Login-Daten werden nur zur Authentifizierung gespeichert und verschlüsselt verarbeitet.</li>
        <li>Cookies und LocalStorage werden ausschließlich für die Funktion der Seite verwendet.</li>
      </ul>
      <p className="mt-4 text-sm text-neutral-500">Verantwortlich: Urixsoft Software Solutions</p>
    </div>
  );
}