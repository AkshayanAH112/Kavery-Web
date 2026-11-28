/**
 * The words sent to a family when their child is deactivated for missing two
 * classes in a row, in Tamil and in English. Client-safe.
 */

export const ABSENCE_LOCK_TITLE = "வகுப்பு வருகை · Class attendance";

export function absenceLockText(name: string) {
  const ta = [
    `அன்புள்ள பெற்றோரே, ${name} தொடர்ந்து இரண்டு வகுப்புகளுக்கு வரவில்லை.`,
    `அதனால் வகுப்பு வருகை தற்காலிகமாக இடைநிறுத்தப்பட்டுள்ளது.`,
    `மீண்டும் வகுப்புகளில் கலந்துகொள்ள, தயவுசெய்து KEDA நிர்வாகத்தைத் தொடர்புகொள்ளுங்கள்.`,
  ].join(" ");
  const en = [
    `Dear parent, ${name} has missed two classes in a row,`,
    `so their class attendance has been put on hold.`,
    `Please contact the KEDA office so they can attend classes again.`,
  ].join(" ");
  return { ta, en };
}
