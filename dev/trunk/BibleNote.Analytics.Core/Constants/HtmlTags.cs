﻿
namespace BibleNote.Analytics.Core.Constants
{
    public static class HtmlTags
    {
        public const string Br = "br";
        public const string Table = "table";
        public const string TableRow = "tr";
        public const string TableCell = "td";
        public const string Nbsp = "&nbsp;";        
        public const string Head = "head";
        public const string Html = "html";
        public const string ListElement = "li";

        public static readonly string[] ListElements = new string[] { "ul", "ol" };
        public static readonly string[] BlockElements = new string[] { "div", "article", "body", "aside", "footer", "nav", "section", "" };
    }
}
