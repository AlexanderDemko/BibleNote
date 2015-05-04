using BibleNote.Analytics.Contracts;
using BibleNote.Analytics.Core.Constants;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Analytics.Models.Common;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class BookEntry
    {
        public BibleBookInfo BookInfo { get; set; }
        public string ModuleName { get; set; }
        public int StartIndex { get; set; }
        public int EndIndex { get; set; }
    }

    public class VerseNumberEntry 
    {
        public VerseNumber VerseNumber { get; set; }
        public int Startindex { get; set; }
        public int EndIndex { get; set; }
    }

    /// <summary>
    /// Класс оперирует только обычной строкой. Ничего не знает об html. Ищет стих только в пределах переданной строки. Ему не важно, нашёл он книгу, главу или только стих.
    /// </summary>
    public class VerseRecognitionService : IVerseRecognitionService
    {
        [Dependency]
        public IVersePointerFactory VersePointerFactory { get; set; }

        [Dependency]
        public IConfigurationManager ConfigurationManager { get; set; }

        [Dependency]
        public IModulesManager ModulesManager { get; set; }

        [Dependency]
        public IApplicationManager ApplicationManager { get; set; }        
        
        public VerseEntryInfo TryGetVerse(string text, int startIndex)
        {   
            VerseEntryInfo result = null;

            var indexOfDigit = StringUtils.GetNextIndexOfDigit(text, startIndex);
            while (indexOfDigit != -1)
            {
                if (EntryIsLikeVerse(text, indexOfDigit))
                {
                    var actualStringStartIndex = indexOfDigit - ApplicationManager.CurrentModuleInfo.MaxBookNameLength - 2;
                    if (actualStringStartIndex < startIndex) 
                        actualStringStartIndex = startIndex;
                    
                    result = TryGetVerseEntry(text, actualStringStartIndex, indexOfDigit);                    
                }

                if (result != null && result.VersePointerFound)
                    break;
                else
                    indexOfDigit = StringUtils.GetNextIndexOfDigit(text, indexOfDigit + 1);
            }

            return result;
        }

        private VerseEntryInfo TryGetVerseEntry(string text, int startIndex, int indexOfDigit)
        {
            var bookEntry = TryGetBookName(text, startIndex, indexOfDigit);
            var verseNumber = TryGetVerseNumber(text, indexOfDigit);
            var topVerseNumber = TryGetTopVerseNumber(text, verseNumber.EndIndex + 1);
            

            var result = new VerseEntryInfo()
            {
                StartIndex = bookEntry != null ? bookEntry.StartIndex : indexOfDigit,
                EndIndex = (topVerseNumber ?? verseNumber).EndIndex,
                VersePointer = new VersePointer(bookEntry.BookInfo, bookEntry.ModuleName, verseNumber.VerseNumber, topVerseNumber != null ? topVerseNumber.VerseNumber : (VerseNumber?)null)
                //, EntryType = GetEntryType()
            };

            //todo: надо правильно понимать стихи :5, 5 стих, ст.5 или просто "Ин 5". В таких случаях разные будут StartIndex.
                    //if (prevChar == ",")    // надо проверить, чтоб предыдущий символ тоже был цифрой   
            //todo: оказывается, что здесь надо ещё возвращать IsImportantVerse, IsExcluded, IsInSquareBrackets

            return result;
        }

        private VerseEntryType GetEntryType()
        {
            throw new NotImplementedException();
        }

        private VerseNumberEntry TryGetVerseNumber(string text, int indexOfDigit)
        {
            char[] chapterDigits = new char[3];
            char[] verseDigits = new char[3];
            var chapterIndex = 0;
            var verseIndex = 0;
            var chapterWasFound = false;
            var spaceWasFound = false;
            var cursorIndex = indexOfDigit;
            var maxVerseNumberLength = 9;

            //todo: здесь проблема. Мы захватываем последний пробел. Потому что считаем пробел нормальным, хотя он нормален только между глава/разделитель/стих.
            while (cursorIndex - indexOfDigit + 1 <= maxVerseNumberLength)
            {
                var c = StringUtils.GetCharLight(text, cursorIndex++);

                if (char.IsDigit(c))
                {
                    if (!chapterWasFound)
                        chapterDigits[chapterIndex++] = c;
                    else
                        verseDigits[verseIndex++] = c;

                    spaceWasFound = false;
                }
                else if (c == ' ' && !spaceWasFound)
                {
                    spaceWasFound = true;
                }
                else if (VerseUtils.GetChapterVerseDelimiters(ConfigurationManager.UseCommaDelimiter).Contains(c) && !chapterWasFound)
                {
                    chapterWasFound = true;
                    spaceWasFound = false;
                }
                else
                    break;
            }

            var chapter = VerseUtils.GetVerseNumber(chapterDigits, chapterIndex);            
            var verse = VerseUtils.GetVerseNumber(verseDigits, verseIndex);            

            return new VerseNumberEntry() { EndIndex = cursorIndex - 1, VerseNumber = new VerseNumber(chapter, verse)};            
        }

        private VerseNumberEntry TryGetTopVerseNumber(string text, int startIndex)
        {
            var cursorIndex = startIndex;
            var dashWasFound = false;
            var digitWasFound = false;
            var maxSpaceBetweenVerseNumbers = 3;

            while (cursorIndex - startIndex <= maxSpaceBetweenVerseNumbers)
            {
                var c = StringUtils.GetCharLight(text, cursorIndex++);
                
                if (VerseUtils.Dashes.Contains(c) && !dashWasFound)
                {
                    dashWasFound = true;                    
                }                
                else if (char.IsDigit(c) && dashWasFound)                
                {
                    digitWasFound = true;
                    break;
                }                
                else if (c != ' ')
                    break;
            }

            if (dashWasFound && digitWasFound)
                return TryGetVerseNumber(text, cursorIndex);
            else
                return null;
        }        

        private BookEntry TryGetBookName(string text, int startIndex, int indexOfDigit)
        {
            BookEntry bookEntry = null;

            if (startIndex >= 0 && indexOfDigit - startIndex > 1)
            {
                var endIndex = GetBookEndIndex(text, indexOfDigit);
                var bookPotentialString = text.Substring(startIndex, endIndex - startIndex + 1);
                bookEntry = GetBookName(bookPotentialString, text[endIndex + 1] == '.');  // здесь text[endIndex + 1] не выдаст исключения, так как до этого мы работали с бОльшими индексами.
                bookEntry.StartIndex += startIndex;
                bookEntry.EndIndex = endIndex;
            }

            return bookEntry;
        }

        private int GetBookEndIndex(string text, int indexOfDigit)
        {
            var endIndex = indexOfDigit - 1;
            var maxMidSymbols = 4;
            while (endIndex > 0 && !char.IsLetter(text[endIndex]))
            {
                if (VerseUtils.MidVerseChars.Contains(text[endIndex]) && indexOfDigit - endIndex <= (maxMidSymbols + 1))
                    endIndex--;
                else 
                    break;
            }

            return endIndex;
        }

        private BookEntry GetBookName(string text, bool endsWithDot)
        {
            var index = -1;            
            string moduleName;
            var startIndex = 0;

            do
            {
                var bibleBookInfo = ApplicationManager.CurrentModuleInfo.GetBibleBook(text, endsWithDot, out moduleName);
                if (bibleBookInfo != null)
                    return new BookEntry() { BookInfo = bibleBookInfo, ModuleName = moduleName, StartIndex = startIndex };
                else
                {
                    index = text.IndexOfAny(VerseUtils.WordDelimiters);
                    if (index != -1)
                    {
                        text = text.Substring(index + 1);
                        startIndex += index + 1;
                    }
                }

            } while (index > -1);

            return null;
        }

        private bool EntryIsLikeVerse(string text, int indexOfDigit)
        {
            var prevChar = StringUtils.GetChar(text, indexOfDigit - 1);
            int indexOfChar;
            var nextChar = StringUtils.GetCharAfterNumber(text, indexOfDigit, out indexOfChar);

            var result = (VerseUtils.GetStartVerseChars(ConfigurationManager.UseCommaDelimiter).Contains(prevChar) || char.IsLetter(prevChar))
                 && (nextChar == default(char) || !(char.IsLetter(nextChar) || char.IsDigit(nextChar)));

            return result;
        }
    }
}
