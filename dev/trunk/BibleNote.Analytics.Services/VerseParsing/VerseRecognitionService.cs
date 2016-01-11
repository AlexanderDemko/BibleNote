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
    
    /// <summary>
    /// Класс оперирует только обычной строкой. Ничего не знает об html. Ищет стих только в пределах переданной строки. Ему неважно, нашёл он книгу, главу или только стих.
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
            var verseNumberEntry = TryGetVerseNumber(text, indexOfDigit, ConfigurationManager.UseCommaDelimiter);
            var topVerseNumberEntry = TryGetTopVerseNumber(text, verseNumberEntry.EndIndex + 1);

            var entryType = GetEntryType(bookEntry, verseNumberEntry);
            if ((entryType == VerseEntryType.Chapter || entryType == VerseEntryType.ChapterOrVerse || entryType == VerseEntryType.Verse)
                && !verseNumberEntry.CanBeJustNumber(text, topVerseNumberEntry))
                verseNumberEntry.VerseNumber = new VerseNumber();

            if (verseNumberEntry.VerseNumber.IsEmpty)
                return new VerseEntryInfo() { EntryType = VerseEntryType.None };

            var entryStartIndex = bookEntry != null ? bookEntry.StartIndex : verseNumberEntry.StartIndex;
            var entryEndIndex = verseNumberEntry != null ? (topVerseNumberEntry ?? verseNumberEntry).EndIndex : indexOfDigit;            

            var result = new VerseEntryInfo()
            {
                StartIndex = entryStartIndex,
                EndIndex = entryEndIndex,
                VersePointer = new VersePointer(
                    bookEntry != null ? bookEntry.BookInfo : null, bookEntry != null ? bookEntry.ModuleName : null,
                    verseNumberEntry.VerseNumber,  
                    topVerseNumberEntry != null ? topVerseNumberEntry.VerseNumber : (VerseNumber?)null),
                EntryType = GetEntryType(bookEntry, verseNumberEntry),  // нужно заново пересчитать, так как могло измениться в verseNumberEntry.CanBeJustNumber
                VerseEntryOptions = GetVerseEntryOptions(text, entryStartIndex, entryEndIndex)
            };

            return result;
        }

        private VerseEntryOptions GetVerseEntryOptions(string text, int entryStartIndex, int entryEndIndex)
        {
            var prevChar = StringUtils.GetChar(text, entryStartIndex - 1);
            var nextChar = StringUtils.GetChar(text, entryEndIndex + 1);

            if (prevChar == '*' && nextChar == '*')
                return VerseEntryOptions.ImportantVerse;

            if (prevChar == '[' && nextChar == ']')
                return VerseEntryOptions.InSquareBrackets;

            return VerseEntryOptions.None;
        }

        private VerseEntryType GetEntryType(BookEntry bookEntry, VerseNumberEntry verseNumberEntry)
        {
            if (verseNumberEntry.VerseNumber.IsEmpty)
                return VerseEntryType.None;

            if (bookEntry != null)
                return verseNumberEntry.VerseNumber.IsChapter ? VerseEntryType.BookChapter : VerseEntryType.BookChapterVerse;
            else
            {
                if (verseNumberEntry.IsVerse)
                    return VerseEntryType.Verse;

                return verseNumberEntry.VerseNumber.IsChapter ? VerseEntryType.ChapterOrVerse : VerseEntryType.ChapterVerse;
            }
        }        

        private VerseNumberEntry TryGetVerseNumber(string text, int indexOfDigit, bool useCommaDelimiter)
        {
            char[] chapterDigits = new char[3];
            char[] verseDigits = new char[3];
            var chapterIndex = 0;
            var verseIndex = 0;
            var chapterWasFound = false;
            var spaceWasFound = false;
            var cursorIndex = indexOfDigit;
            var maxVerseNumberLength = 9;
            var lastValuableCharIndex = 0;
            
            while (cursorIndex - indexOfDigit + 1 <= maxVerseNumberLength)
            {
                var c = StringUtils.GetChar(text, cursorIndex);

                if (char.IsDigit(c))
                {
                    if (!chapterWasFound)
                        chapterDigits[chapterIndex++] = c;
                    else
                        verseDigits[verseIndex++] = c;

                    lastValuableCharIndex = cursorIndex;
                    spaceWasFound = false;
                }
                else if (c == ' ' && !spaceWasFound)
                {
                    spaceWasFound = true;
                }
                else if (VerseUtils.IsChapterVerseDelimiter(c, useCommaDelimiter) && !chapterWasFound)
                {
                    chapterWasFound = true;
                    spaceWasFound = false;
                }
                else
                    break;

                cursorIndex++;
            }

            var chapter = VerseUtils.GetVerseNumber(chapterDigits, chapterIndex);            
            var verse = VerseUtils.GetVerseNumber(verseDigits, verseIndex);            

            return new VerseNumberEntry() { StartIndex = indexOfDigit, EndIndex = lastValuableCharIndex, VerseNumber = new VerseNumber(chapter, verse)};            
        }

        private VerseNumberEntry TryGetTopVerseNumber(string text, int startIndex)
        {
            var cursorIndex = startIndex;
            var dashWasFound = false;
            var digitWasFound = false;
            var indexOfDigit = 0;
            var maxSpaceBetweenVerseNumbers = 3;

            while (cursorIndex - startIndex <= maxSpaceBetweenVerseNumbers)
            {
                var c = StringUtils.GetChar(text, cursorIndex);
                
                if (VerseUtils.IsDash(c) && !dashWasFound)
                {
                    dashWasFound = true;                    
                }                
                else if (char.IsDigit(c) && dashWasFound)                
                {
                    digitWasFound = true;
                    indexOfDigit = cursorIndex;
                    break;
                }                
                else if (c != ' ')
                    break;

                cursorIndex++;
            }

            if (dashWasFound && digitWasFound)
                return TryGetVerseNumber(text, indexOfDigit, false);
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
                if (bookEntry != null)
                {
                    bookEntry.StartIndex += startIndex;
                    bookEntry.EndIndex = endIndex;
                }
            }

            return bookEntry;
        }

        private int GetBookEndIndex(string text, int indexOfDigit)
        {
            var endIndex = indexOfDigit - 1;
            var maxMidSymbols = 4;
            while (endIndex > 0 && !char.IsLetter(text[endIndex]))
            {
                if (VerseUtils.IsMidVerseChar(text[endIndex]) && indexOfDigit - endIndex <= (maxMidSymbols + 1))
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

            var result = (VerseUtils.IsStartVerseChar(prevChar, ConfigurationManager.UseCommaDelimiter) || char.IsLetter(prevChar))
                 && (nextChar == default(char) || !(char.IsLetter(nextChar) || char.IsDigit(nextChar)));

            return result;
        }
    }
}
