using BibleNote.Providers.OneNote.Constants;
using System.Xml;
using System.Xml.Linq;

namespace BibleNote.Providers.OneNote.Utils
{
    static class OneNoteUtils
    {
        public static XmlNamespaceManager GetOneNoteXNM()
        {
            var xnm = new XmlNamespaceManager(new NameTable());
            xnm.AddNamespace(OneNoteConstants.OneNotePrefix, OneNoteConstants.OneNoteXmlNs);

            return xnm;
        }

        public static bool IsRecycleBin(XElement hierarchyElement)
        {
            return bool.Parse(GetAttributeValue(hierarchyElement, "isInRecycleBin", false.ToString()))
                || bool.Parse(GetAttributeValue(hierarchyElement, "isRecycleBin", false.ToString()));
        }

        public static string GetAttributeValue(XElement el, string attributeName, string defaultValue)
        {
            if (el.Attribute(attributeName) != null)
            {
                return (string)el.Attribute(attributeName);
            }

            return defaultValue;
        }
    }
}
