using System.Text.RegularExpressions;

namespace BibleNote.Tests
{
    internal static class HtmlComparison
    {
        private static readonly Regex AttributeRegex = new Regex(
            @"(?<prefix>\s)(?<name>[A-Za-z_:][A-Za-z0-9_:-]*)='(?<value>[^']*)'",
            RegexOptions.Compiled);

        public static string NormalizeAttributeQuotes(string value)
        {
            return AttributeRegex.Replace(value, match => $"{match.Groups["prefix"].Value}{match.Groups["name"].Value}=\"{match.Groups["value"].Value}\"");
        }
    }
}
