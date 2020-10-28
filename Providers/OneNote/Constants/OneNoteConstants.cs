using Microsoft.Office.Interop.OneNote;

namespace BibleNote.Providers.OneNote.Constants
{
    public static class OneNoteConstants
    {
        public const string OneNoteXmlNs = "http://schemas.microsoft.com/office/onenote/2010/onenote";
        public const XMLSchema CurrentOneNoteSchema = XMLSchema.xs2013;
        public const string NotebookNameDelimiter = " [\"";
        public const string OneNotePrefix = "one";
    }
}
