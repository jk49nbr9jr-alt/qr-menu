export default function Cookies() {
  return (
    <div className="max-w-3xl mx-auto p-6 text-neutral-800 dark:text-neutral-100">
      <h1 className="text-2xl font-bold mb-4">Cookie Policy</h1>
      <p>Diese Anwendung verwendet ausschließlich technisch notwendige Cookies:</p>
      <ul className="list-disc pl-6 mt-3 space-y-2">
        <li>Ein Cookie zur Speicherung Ihrer Zustimmung (cookie-consent).</li>
        <li>SessionStorage zur Zwischenspeicherung des Login-Status (nicht dauerhaft).</li>
      </ul>
      <p className="mt-4">Es werden keine Cookies von Dritten oder Analyse-Tools verwendet.</p>
    </div>
  );
}