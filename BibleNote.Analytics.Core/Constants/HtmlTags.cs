
namespace BibleNote.Analytics.Core.Constants
{
    public static class HtmlTags
    {
        public const string Br = "br";
        public const string Table = "table";
        public const string TableRow = "tr";        
        public const string Nbsp = "&nbsp;";        
        public const string Head = "head";
        public const string Html = "html";

        public static readonly string[] TableCells = new string[] { "td", "th" };
        public static readonly string[] ListElements = new string[] { "li", "dt" };
        public static readonly string[] Lists = new string[] { "ul", "ol", "dl" };
        public static readonly string[] TableBodys = new string[] { "thead", "tbody", "tfoot" };
        public static readonly string[] BlockElements = new string[] {
            "div", "article", "body", "aside", "footer", "nav", "section", "html",
            "#document", "header", "fieldset", "form", "hgroup", "main"
        };
    }
}
