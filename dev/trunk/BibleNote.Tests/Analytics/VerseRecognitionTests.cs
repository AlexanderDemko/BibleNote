using BibleNote.Analytics.Contracts;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Services.System;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class VerseRecognitionTests
    {
        private IVerseRecognitionService _verseRecognitionService;

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
            _verseRecognitionService = DIContainer.Resolve<IVerseRecognitionService>();
        }

        private void AssertVerseEntry(VerseEntryInfo verseEntryInfo, int startIndex, int endIndex, VerseEntryType verseEntryType,
            VerseEntryOptions? verseEntryOptions = null)
        {
            Assert.AreEqual(startIndex, verseEntryInfo.StartIndex);
            Assert.AreEqual(endIndex, verseEntryInfo.EndIndex);
            Assert.AreEqual(verseEntryType, verseEntryInfo.EntryType);

            if (verseEntryOptions.HasValue)
                Assert.AreEqual(verseEntryOptions.Value, verseEntryInfo.VerseEntryOptions);
        }

        [TestMethod]
        public void FindVerseEntries()
        {
            var s = "Тест и Ин 5:6, а потом 5:7,8. 9 глава. 10 стих. и :7. ст.5-6. *:8-9*, [5:7], в 5 стихе, в главе 6. Лк 5-6,8 и 7:9";

            var verseEntry = _verseRecognitionService.TryGetVerse(s, 0);
            AssertVerseEntry(verseEntry, 7, 12, VerseEntryType.BookChapterVerse);

            verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 23, 25, VerseEntryType.ChapterVerse);

            verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 27, 27, VerseEntryType.ChapterOrVerse);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 30, 36, VerseEntryType.Chapter);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 39, 45, VerseEntryType.Verse);

            verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 50, 51, VerseEntryType.Verse);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 54, 59, VerseEntryType.Verse);

            verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 63, 66, VerseEntryType.Verse, VerseEntryOptions.ImportantVerse);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 71, 73, VerseEntryType.ChapterVerse, VerseEntryOptions.InSquareBrackets);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 79, 85, VerseEntryType.Verse);

            //verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            //AssertVerseEntry(verseEntry, 90, 96, VerseEntryType.Chapter);

            verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 99, 104, VerseEntryType.BookChapter);

            verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 106, 106, VerseEntryType.ChapterOrVerse);

            verseEntry = _verseRecognitionService.TryGetVerse(s, verseEntry.EndIndex + 1);
            AssertVerseEntry(verseEntry, 110, 112, VerseEntryType.ChapterVerse);
        }
    }
}
