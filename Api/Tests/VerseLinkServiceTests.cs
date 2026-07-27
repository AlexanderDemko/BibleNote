using BibleNote.Services.Contracts;
using BibleNote.Services.ModulesManager.Models;
using BibleNote.Services.ModulesManager.Scheme.Module;
using BibleNote.Services.VerseParsing.Models;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class VerseLinkServiceTests : TestsBase.TestsBase
    {
        [TestMethod]
        public void CreatesNewBibleNoteLinksWithTheBnVerseProtocol()
        {
            base.Init();
            var service = ServiceProvider.GetRequiredService<IVerseLinkService>();
            var verse = new VersePointer(
                new BibleBookInfo { Index = 50, Name = "К Филиппийцам" },
                null,
                "Фил 4:1-3",
                new VerseNumber(4, 1),
                new VerseNumber(4, 3));

            service.GetVerseLink(verse).Should().Be("bnVerse:rst/50 4:1-3;К Филиппийцам 4:1-3");
        }
    }
}
