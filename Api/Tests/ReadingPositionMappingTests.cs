using System.Linq;
using BibleNote.Application.Controllers;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class ReadingPositionMappingTests : TestsBase.TestsBase
    {
        [TestInitialize]
        public void Initialize()
        {
            base.Init();
        }

        [DataTestMethod]
        [DataRow("rst", 50, 12, "kjv", 51, 10)]
        [DataRow("kjv", 51, 10, "rst", 50, 12)]
        [DataRow("rst", 9, 25, "kjv", 10, 4)]
        [DataRow("kjv", 10, 4, "rst", 9, 25)]
        [DataRow("rst", 113, 9, "kjv", 115, 1)]
        [DataRow("kjv", 115, 1, "rst", 113, 9)]
        public void Psalm_reading_position_uses_the_bundled_modules_correspondence(
            string source, int chapter, int verse, string target, int targetChapter, int targetVerse)
        {
            var controller = ActivatorUtilities.CreateInstance<VerseParsingController>(ServiceProvider);
            var response = controller.ParallelVerseText(new ParallelVerseTextRequest
            {
                BaseModule = source,
                Module = target,
                BookIndex = 19,
                Chapter = chapter
            }).Value;

            response.Should().NotBeNull();
            var row = response.Rows.Single(item => item.BaseChapter == chapter && item.BaseVerse == verse);
            row.Verses.Should().Contain(item => !item.IsEmpty
                && item.Chapter == targetChapter
                && item.Verse <= targetVerse
                && (item.TopVerse ?? item.Verse) >= targetVerse);
        }
    }
}
