import { useEffect, useState } from "react";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("cookie-consent");
    if (!accepted) setVisible(true);
  }, []);

  const acceptCookies = () => {
    localStorage.setItem("cookie-consent", "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 text-center shadow-lg z-50 flex flex-col sm:flex-row items-center justify-center gap-4">
      <p className="text-sm">
        Wir verwenden nur technisch notwendige Cookies, um diese Seite
        funktionsfähig zu machen. Es werden keine Tracking-Daten gespeichert.
      </p>
      <button
        onClick={acceptCookies}
        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full text-sm font-semibold"
      >
        Verstanden
      </button>
    </div>
  );
}