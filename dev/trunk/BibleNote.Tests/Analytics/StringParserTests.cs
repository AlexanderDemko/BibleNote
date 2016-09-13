﻿using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Tests.Analytics.Mocks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Microsoft.Practices.Unity;
using BibleNote.Analytics.Models.VerseParsing;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class StringParserTests : TestsBase
    {
        private IStringParser _stringParser;

        [TestInitialize]
        public override void Init()
        {
            base.Init();

            _stringParser = DIContainer.Resolve<IStringParser>();
        }

        private void AssertVerseEntry(VerseEntry verseEntryInfo, int startIndex, int endIndex, VerseEntryType verseEntryType,
            VerseEntryOptions? verseEntryOptions = null)
        {
            Assert.AreEqual(startIndex, verseEntryInfo.StartIndex);
            Assert.AreEqual(endIndex, verseEntryInfo.EndIndex);
            Assert.AreEqual(verseEntryType, verseEntryInfo.EntryType);

            if (verseEntryOptions.HasValue)
                Assert.AreEqual(verseEntryOptions.Value, verseEntryInfo.EntryOptions);
        }

        [TestMethod]
        public void StringParserTest()
        {
            var s = "Тест и Ин 5:6, а потом 5:7,8. 9 глава. 10 стих. и :7. ст.5-6. *:8-9*, [5:7], в 5 стихе, в главе 6. Лк 5-6,8 и 7:9";

            var verseEntry = _stringParser.TryGetVerse(s, 0);
            AssertVerseEntry(verseEntry, 7, 12, VerseEntryType.BookChapterVerse);

            verseEntry = _stringParser.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 23, 25, VerseEntryType.ChapterVerse);

            verseEntry = _stringParser.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 27, 27, VerseEntryType.ChapterOrVerse);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 30, 36, VerseEntryType.Chapter);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 39, 45, VerseEntryType.Verse);

            verseEntry = _stringParser.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 50, 51, VerseEntryType.Verse);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 54, 59, VerseEntryType.Verse);

            verseEntry = _stringParser.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 63, 66, VerseEntryType.Verse, VerseEntryOptions.ImportantVerse);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 71, 73, VerseEntryType.ChapterVerse, VerseEntryOptions.InSquareBrackets);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 79, 85, VerseEntryType.Verse);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 90, 96, VerseEntryType.Chapter);

            verseEntry = _stringParser.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 99, 104, VerseEntryType.BookChapter);

            verseEntry = _stringParser.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 106, 106, VerseEntryType.ChapterOrVerse);

            verseEntry = _stringParser.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 110, 112, VerseEntryType.ChapterVerse);
        }
    }
}
