using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Contracts.VerseParsing;
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
    public class StringParser : IStringParser
    {
        internal class TextPointInfo
        {
            internal BookEntry BookEntry { get; set; }
            internal VerseNumberEntry VerseNumberEntry { get; set; }
            internal VerseNumberEntry TopVerseNumberEntry { get; set; }
            internal VerseEntryType EntryType { get; private set; }

            internal BibleBookInfo BibleBookInfo
            {
                get
                {
                    return BookEntry != null ? BookEntry.BookInfo : null;
                }
            }

            internal string ModuleName
            {
                get
                {
                    return BookEntry != null ? BookEntry.ModuleName : null;
                }
            }

            internal TextPointInfo(BookEntry bookEntry, VerseNumberEntry verseNumberEntry, VerseNumberEntry topVerseNumberEntry)
            {
                BookEntry = bookEntry;
                VerseNumberEntry = verseNumberEntry;
                TopVerseNumberEntry = topVerseNumberEntry;
                EntryType = GetEntryType();
            }

            private VerseEntryType GetEntryType()
            {
                if (VerseNumberEntry.VerseNumber.IsEmpty)
                    return VerseEntryType.None;

                if (BookEntry != null)
                    return VerseNumberEntry.VerseNumber.IsChapter ? VerseEntryType.BookChapter : VerseEntryType.BookChapterVerse;

                if (VerseNumberEntry.IsVerse)
                    return VerseEntryType.Verse;

                if (VerseNumberEntry.IsChapter)
                    return VerseEntryType.Chapter;

                return VerseNumberEntry.VerseNumber.IsChapter ? VerseEntryType.ChapterOrVerse : VerseEntryType.ChapterVerse;
            }

            internal bool CanBeJustNumber(string text)
            {
                var result = VerseNumberEntry.CanBeJustNumber(text, TopVerseNumberEntry);       // здесь может измениться IsVerse

                EntryType = GetEntryType();
                if (VerseNumberEntry.IsVerse)       // например, ":5-7"
                {
                    VerseNumberEntry.VerseNumber = new VerseNumber(0, VerseNumberEntry.VerseNumber.Chapter);
                    if (TopVerseNumberEntry != null)
                        TopVerseNumberEntry.VerseNumber = new VerseNumber(0, TopVerseNumberEntry.VerseNumber.Chapter);
                }

                return result;
            }
        }

        private readonly IModulesManager _modulesManager;

        private readonly IApplicationManager _applicationManager;

        private readonly IConfigurationManager _configurationManager;

        public StringParser(IModulesManager modulesManager, IApplicationManager applicationManager, IConfigurationManager configurationManager)
        {
            _modulesManager = modulesManager;
            _applicationManager = applicationManager;
            _configurationManager = configurationManager;
        }

        public VerseEntryInfo TryGetVerse(string text, int startIndex)
        {
            return TryGetVerse(text, startIndex, startIndex, _configurationManager.UseCommaDelimiter);
        }

        public VerseEntryInfo TryGetVerse(string text, int startIndex, int leftBoundary, bool useCommaDelimiter)
        {
            VerseEntryInfo result = null;

            var indexOfDigit = StringUtils.GetNextIndexOfDigit(text, startIndex);
            while (indexOfDigit != -1)
            {
                if (EntryIsLikeVerse(text, indexOfDigit, useCommaDelimiter))
                {
                    var actualStringStartIndex = indexOfDigit - _applicationManager.CurrentModuleInfo.MaxBookNameLength - 2;
                    if (actualStringStartIndex < leftBoundary)
                        actualStringStartIndex = leftBoundary;

                    result = TryGetVerseEntry(text, actualStringStartIndex, indexOfDigit, useCommaDelimiter);
                }

                if (result != null && result.VersePointerFound)
                    break;
                else
                    indexOfDigit = StringUtils.GetNextIndexOfDigit(text, indexOfDigit + 1);
            }

            if (result == null)
                result = new VerseEntryInfo() { EntryType = VerseEntryType.None };

            return result;
        }

        private TextPointInfo GetTextPointInfo(string text, int startIndex, int indexOfDigit, bool useCommaDelimiter)
        {
            var bookEntry = TryGetBookName(text, startIndex, indexOfDigit);
            var verseNumberEntry = TryGetVerseNumber(text, indexOfDigit, bookEntry != null ? useCommaDelimiter : false);      // запятую в качестве разделителя можно использовать только для BookChapterVerse
            var topVerseNumberEntry = TryGetTopVerseNumber(text, verseNumberEntry.EndIndex + 1, verseNumberEntry.VerseNumber);

            return new TextPointInfo(bookEntry, verseNumberEntry, topVerseNumberEntry);            
        }

        private VerseEntryInfo TryGetVerseEntry(string text, int startIndex, int indexOfDigit, bool useCommaDelimiter)
        {
            var textPointInfo = GetTextPointInfo(text, startIndex, indexOfDigit, useCommaDelimiter);
                        
            if (textPointInfo.EntryType > VerseEntryType.ChapterVerse)
            {
                if (!textPointInfo.CanBeJustNumber(text))
                    textPointInfo.VerseNumberEntry.VerseNumber = new VerseNumber();
                else
                {
                    var nextIndexOfDigit = StringUtils.GetNextIndexOfDigit(text, indexOfDigit + 1);
                    if (nextIndexOfDigit != -1 && nextIndexOfDigit - indexOfDigit <= _applicationManager.CurrentModuleInfo.MaxBookNameLength)
                    {
                        var nextTextPointInfo = GetTextPointInfo(text, indexOfDigit, nextIndexOfDigit, useCommaDelimiter);
                        if (nextTextPointInfo.EntryType == VerseEntryType.BookChapter || nextTextPointInfo.EntryType == VerseEntryType.BookChapterVerse)
                        {
                            if (nextTextPointInfo.BookEntry.StartIndex == indexOfDigit)
                                textPointInfo.SetEmpty();
                        }
                    }
                }
            }

            if (textPointInfo.IsEmpty)
            if (textPointInfo.VerseNumberEntry.VerseNumber.IsEmpty)
                return new VerseEntryInfo() { EntryType = VerseEntryType.None };

            var entryStartIndex = textPointInfo.BookEntry != null ? textPointInfo.BookEntry.StartIndex : textPointInfo.VerseNumberEntry.StartIndex;
            var entryEndIndex = textPointInfo.VerseNumberEntry != null ? (textPointInfo.TopVerseNumberEntry ?? textPointInfo.VerseNumberEntry).EndIndex : indexOfDigit;

            // Если проверок будет больше, надо будет, наверное, сделать StringParser TransientLifetimeManager и вынести эту логику отдельно.
            if (StringUtils.GetChar(text, entryEndIndex + 1) == ')' && StringUtils.GetChar(text, indexOfDigit - 1) == '(')
                entryEndIndex++;

            var result = new VerseEntryInfo()
            {
                EntryType = textPointInfo.EntryType, 
                EntryOptions = GetEntryOptions(text, entryStartIndex, entryEndIndex),
                StartIndex = entryStartIndex,
                EndIndex = entryEndIndex,
                VersePointer = new VersePointer(
                    textPointInfo.BibleBookInfo,
                    textPointInfo.ModuleName,
                    text.Substring(entryStartIndex, entryEndIndex - entryStartIndex + 1),
                    textPointInfo.VerseNumberEntry.VerseNumber,
                    textPointInfo.TopVerseNumberEntry != null ? textPointInfo.TopVerseNumberEntry.VerseNumber : (VerseNumber?)null)
            };

            return result;
        }

        private VerseEntryOptions GetEntryOptions(string text, int entryStartIndex, int entryEndIndex)
        {
            var prevChar = StringUtils.GetChar(text, entryStartIndex - 1);
            var nextChar = StringUtils.GetChar(text, entryEndIndex + 1);

            if (prevChar == '*' && nextChar == '*')
                return VerseEntryOptions.ImportantVerse;

            if (prevChar == '[' && nextChar == ']')
                return VerseEntryOptions.InSquareBrackets;

            if (prevChar == '{' && nextChar == '}')
                return VerseEntryOptions.IsExcluded;

            return VerseEntryOptions.None;
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

            return new VerseNumberEntry() { StartIndex = indexOfDigit, EndIndex = lastValuableCharIndex, VerseNumber = new VerseNumber(chapter, verse) };
        }

        private VerseNumberEntry TryGetTopVerseNumber(string text, int startIndex, VerseNumber verseNumber)
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

            if (!dashWasFound || !digitWasFound)
                return null;

            var result = TryGetVerseNumber(text, indexOfDigit, false);
            if (result.VerseNumber.IsChapter && !verseNumber.IsChapter)
                result.VerseNumber = new VerseNumber(verseNumber.Chapter, result.VerseNumber.Chapter);

            if (result.VerseNumber.Chapter < verseNumber.Chapter
                || (result.VerseNumber.IsChapter && result.VerseNumber.Chapter == verseNumber.Chapter)
                || (result.VerseNumber.Chapter == verseNumber.Chapter && result.VerseNumber.Verse <= verseNumber.Verse))
                return null;

            return result;
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
                {
                    endIndex--;
                }
                else
                    break;
            }

            return endIndex;
        }

        private BookEntry GetBookName(string bookPotentialString, bool endsWithDot)
        {
            var index = -1;
            var startIndex = 0;

            do
            {
                var abbreviation = _applicationManager.CurrentModuleInfo.GetBibleBook(bookPotentialString, endsWithDot);
                if (abbreviation != null)
                    return new BookEntry() { BookInfo = abbreviation.BibleBook, ModuleName = abbreviation.ModuleName, StartIndex = startIndex };
                else
                {
                    index = bookPotentialString.IndexOfAny(VerseUtils.WordDelimiters);
                    if (index != -1)
                    {
                        bookPotentialString = bookPotentialString.Substring(index + 1);
                        startIndex += index + 1;
                    }
                }

            } while (index > -1);

            return null;
        }

        private bool EntryIsLikeVerse(string text, int indexOfDigit, bool useCommaDelimiter)
        {
            var prevChar = StringUtils.GetChar(text, indexOfDigit - 1);
            int indexOfChar;
            var nextChar = StringUtils.GetCharAfterNumber(text, indexOfDigit, out indexOfChar);

            var result = (VerseUtils.IsStartVerseChar(prevChar, useCommaDelimiter) || char.IsLetter(prevChar))
                 && (nextChar == default(char) || !char.IsDigit(nextChar));

            return result;
        }
    }
}
