using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Common.Helpers
{
    public static class StringUtils
    {
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

        /// <summary>
        /// возвращает номер, находящийся первым в строке: например вернёт 12 для строки " 12 глава"
        /// ограничение: поддерживает максимум трёхзначные числа
        /// </summary>
        /// <param name="pointerElement"></param>
        /// <returns></returns>
        public static int? GetStringFirstNumber(string s, int startIndex = 0)
        {
            int i = s.IndexOfAny(new char[] { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9' }, startIndex);
            if (i != -1)
            {
                string d1 = s[i].ToString();
                string d2 = string.Empty;
                string d3 = string.Empty;

                d2 = GetDigit(s, i + 1);
                if (!string.IsNullOrEmpty(d2))
                    d3 = GetDigit(s, i + 2);

                return int.Parse(d1 + d2 + d3);
            }

            return null;
        }

        public static char GetCharAfterNumber(string text, int startOfNumberIndex, out int indexOfChar)
        {
            for (var i = 1; i < 3; i++)
            {
                indexOfChar = startOfNumberIndex + i;
                var c = GetChar(text, indexOfChar);
                if (!char.IsDigit(c))
                    return c;
            }

            indexOfChar = startOfNumberIndex + 3;
            return GetChar(text, indexOfChar);
        }

        public static int? GetStringLastNumber(string s)
        {
            int index;
            return GetStringLastNumber(s, out index);
        }

        /// <summary>
        /// возвращает номер, находящийся последним в строке: например вернёт 12 для строки "глава 12 "
        /// </summary>
        /// <param name="pointerElement"></param>
        /// <returns></returns>
        public static int? GetStringLastNumber(string s, out int index)
        {
            index = -1;

            int i = s.LastIndexOfAny(new char[] { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9' });
            if (i != -1)
            {
                string d1 = s[i].ToString();
                string d2 = string.Empty;
                string d3 = string.Empty;

                if (i - 1 >= 0)
                    d2 = GetDigit(s, i - 1);

                if (!string.IsNullOrEmpty(d2))
                    if (i - 2 >= 0)
                        d3 = GetDigit(s, i - 2);

                index = i;
                return int.Parse(d3 + d2 + d1);
            }

            return null;
        }

        public static string GetDigit(string s, int index)
        {
            var value = char.GetNumericValue(GetChar(s, index));
            if (value > -1)
                return value.ToString();

            return string.Empty;
        }

        public static char GetChar(string s, int index)
        {
            if (index >= 0 && index < s.Length)
                return s[index];

            return default(char);
        }       

        public static int GetNextIndexOfDigit(string text, int startIndex)
        {
            var result = -1;

            //if (text.Length >= startIndex + 2)
                result = text.IndexOfAny(new char[] { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9' }, startIndex);

            return result;
        }

        public static bool CheckDivergence(string text, int firstIndex, int secondIndex, int maxSpaces, char allowedDelimiter)
        {
            for (var i = firstIndex + 1; i < secondIndex; i++)
            {
                var symbol = GetChar(text, i);
                if (char.IsWhiteSpace(symbol))
                {
                    if (maxSpaces-- == 0)
                        return false;
                    
                    continue;
                }
                else if (allowedDelimiter != symbol)
                    return false;
            }

            return true;
        }        

        public static char SearchFirstValuablePrevChar(string text, ref int index, ref int maxSpaces)
        {
            index--;

            var lowLimit = index - maxSpaces;
            if (lowLimit < 0)
                lowLimit = 0;

            for (; index >= lowLimit; index--)
            {
                var symbol = GetChar(text, index);
                if (char.IsWhiteSpace(symbol))
                {
                    if (maxSpaces-- == 0)
                        break;

                    continue;
                }
                else
                    return symbol;
            }

            return default(char);
        }
    }
}
