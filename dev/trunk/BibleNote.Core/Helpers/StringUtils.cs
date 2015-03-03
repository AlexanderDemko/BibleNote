using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace BibleNote.Core.Helpers
{
    public static class StringUtils
    {
        private static readonly Regex htmlPattern = new Regex(@"<(.|\n)*?>", RegexOptions.Compiled);

        public static string GetText(string htmlString)
        {
            return htmlPattern.Replace(htmlString, string.Empty);
        }

        /// <summary>
        /// Делает первую букву заглавной. Для строки "1кор" вернёт "1Кор"
        /// </summary>
        /// <param name="bookName"></param>
        /// <returns></returns>
        public static string MakeFirstLetterUpper(string bookName)
        {
            if (!string.IsNullOrEmpty(bookName))
            {
                for (var i = 0; i < bookName.Length; i++)
                {
                    if (char.IsLetter(bookName[i]))
                        return string.Concat(bookName.Substring(0, i), char.ToUpperInvariant(bookName[i]), bookName.Substring(i + 1));
                }
            }

            return bookName;
        }
    }
}
