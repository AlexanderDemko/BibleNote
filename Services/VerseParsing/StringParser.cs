using BibleNote.Analytics.Common.Helpers;
using BibleNote.Analytics.Services.Configuration.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Contracts;
using BibleNote.Analytics.Services.ModulesManager.Models;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models;

namespace BibleNote.Analytics.Services.VerseParsing
{
    /// <summary>
    /// Класс оперирует только обычной строкой. Ничего не знает об html. Ищет стих только в пределах переданной строки. Ему неважно, нашёл он книгу, главу или только стих.
    /// </summary>
    class StringParser : IStringParser
    {
        private readonly IModulesManager _modulesManager;

        private readonly IApplicationManager _applicationManager;

        private readonly IConfigurationManager _configurationManager;

        public StringParser(
            IModulesManager modulesManager, 
            IApplicationManager applicationManager, 
            IConfigurationManager configurationManager)
        {
            _modulesManager = modulesManager;
            _applicationManager = applicationManager;
            _configurationManager = configurationManager;
        }

        public VerseEntry TryGetVerse(string text, int startIndex)
        {
            return TryGetVerse(text, startIndex, startIndex, _configurationManager.UseCommaDelimiter);
        }

        public VerseEntry TryGetVerse(string text, int startIndex, int leftBoundary, bool useCommaDelimiter)
        {
            VerseEntry result = null;

            var maxBookNameLength = _applicationManager.CurrentModuleInfo.MaxBookNameLength - 2;
            var indexOfDigit = StringUtils.GetNextIndexOfDigit(text, startIndex);
            while (indexOfDigit != -1)
            {
                if (EntryIsLikeVerse(text, indexOfDigit, useCommaDelimiter))
                {
                    var actualStringStartIndex = indexOfDigit - maxBookNameLength;
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
                result = new VerseEntry() { EntryType = VerseEntryType.None };

            return result;
        }

        private bool EntryIsLikeVerse(string text, int indexOfDigit, bool useCommaDelimiter)
        {
            var prevChar = StringUtils.GetChar(text, indexOfDigit - 1);
            var nextChar = StringUtils.GetCharAfterNumber(text, indexOfDigit, out int indexOfChar);

            var result = (VerseUtils.IsStartVerseChar(prevChar, useCommaDelimiter) || char.IsLetter(prevChar))
                 && (nextChar == default(char) || !char.IsDigit(nextChar));

            return result;
        }

        private VerseEntry TryGetVerseEntry(string text, int startIndex, int indexOfDigit, bool useCommaDelimiter)
        {
            var textFragmentInfo = GetTextFragmentInfo(text, startIndex, indexOfDigit, useCommaDelimiter);
            CheckTextFragment(textFragmentInfo, text, useCommaDelimiter);

            if (textFragmentInfo.IsEmpty)
                return new VerseEntry() { EntryType = VerseEntryType.None };

            var result = new VerseEntry()
            {
                EntryType = textFragmentInfo.EntryType,
                EntryOptions = textFragmentInfo.GetEntryOptions(),
                StartIndex = textFragmentInfo.Boundaries.StartIndex,
                EndIndex = textFragmentInfo.Boundaries.EndIndex,
                VersePointer = new VersePointer(
                    textFragmentInfo.BibleBookInfo,
                    textFragmentInfo.ModuleName,
                    textFragmentInfo.GetVerseText(),
                    textFragmentInfo.VerseNumber,
                    textFragmentInfo.TopVerseNumber)
            };

            return result;
        }

        private TextFragmentInfo GetTextFragmentInfo(string text, int startIndex, int indexOfDigit, bool useCommaDelimiter)
        {
            var bookEntry = TryGetBookName(text, startIndex, indexOfDigit);
            var verseNumberEntry = TryGetVerseNumber(text, indexOfDigit, bookEntry != null ? useCommaDelimiter : false);      // запятую в качестве разделителя можно использовать только для BookChapterVerse
            var topVerseNumberEntry = TryGetTopVerseNumber(text, verseNumberEntry.EndIndex + 1, verseNumberEntry.VerseNumber);

            return new TextFragmentInfo(indexOfDigit, text, bookEntry, verseNumberEntry, topVerseNumberEntry);            
        }     

        private void CheckTextFragment(TextFragmentInfo textFragmentInfo, string text, bool useCommaDelimiter)
        {
            if (textFragmentInfo.EntryType > VerseEntryType.ChapterVerse)
            {
                if (!textFragmentInfo.CanBeJustNumber(text))
                    textFragmentInfo.SetEmpty();
                else
                {
                    var nextIndexOfDigit = StringUtils.GetNextIndexOfDigit(text, textFragmentInfo.IndexOfDigit + 1);
                    if (nextIndexOfDigit != -1 
                        && nextIndexOfDigit - textFragmentInfo.IndexOfDigit <= _applicationManager.CurrentModuleInfo.MaxBookNameLength)
                    {
                        var nextTextPointInfo = GetTextFragmentInfo(text, textFragmentInfo.IndexOfDigit, nextIndexOfDigit, useCommaDelimiter);
                        if (nextTextPointInfo.EntryType == VerseEntryType.BookChapter 
                            || nextTextPointInfo.EntryType == VerseEntryType.BookChapterVerse)
                        {
                            if (nextTextPointInfo.BookEntry.StartIndex == textFragmentInfo.IndexOfDigit)
                                textFragmentInfo.SetEmpty();
                        }
                    }
                }
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
                    {
                        if (chapterIndex >= chapterDigits.Length)
                            break;

                        chapterDigits[chapterIndex++] = c;
                    }
                    else
                    {
                        if (verseIndex >= verseDigits.Length)
                            break;
                        
                        verseDigits[verseIndex++] = c;
                    }

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

            return new VerseNumberEntry()
            {
                StartIndex = indexOfDigit,
                EndIndex = lastValuableCharIndex,
                VerseNumber = new VerseNumber(chapter, verse)
            };
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
    }
}
