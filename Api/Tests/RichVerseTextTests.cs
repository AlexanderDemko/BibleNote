using System.Linq;
using BibleNote.Application.Controllers;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;
using FluentAssertions;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class RichVerseTextTests
    {
        [TestMethod]
        public void Projects_semantic_styles_breaks_and_footnotes_without_adding_note_text_to_the_verse()
        {
            var verse = new VERS
            {
                Items = new object[]
                {
                    "Before ",
                    new STYLE
                    {
                        fs = TStyleFix.italic,
                        fsSpecified = true,
                        Items = new object[] { "italic" }
                    },
                    new BR { art = BreakType.xp },
                    new STYLE
                    {
                        id = "mybible-words-of-jesus",
                        Items = new object[] { " words" }
                    },
                    new NOTE
                    {
                        ex = "[a]",
                        Text = new[] { "Footnote body" }
                    }
                }
            };

            var result = VerseRichTextProjector.Project(verse);

            result.Text.Should().Be("Before italic words");
            result.Decorations.Select(item => item.Kind).Should().Equal("italic", "words-of-jesus");
            result.Decorations[0].StartOffset.Should().Be(7);
            result.Decorations[0].EndOffset.Should().Be(13);
            result.Breaks.Single().Kind.Should().Be("paragraph");
            result.Breaks.Single().Offset.Should().Be(13);
            result.Footnotes.Single().Marker.Should().Be("[a]");
            result.Footnotes.Single().Text.Should().Be("Footnote body");
            result.Text.Should().NotContain("Footnote body");
        }
    }
}
