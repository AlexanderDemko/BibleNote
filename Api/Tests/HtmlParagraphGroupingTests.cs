using System.Linq;
using BibleNote.Application.Controllers;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.Contracts;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ParallelVerses.Contracts;
using BibleNote.Services.VerseParsing.Contracts;
using BibleNote.Tests.TestsBase;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class HtmlParagraphGroupingTests : TestsBase.TestsBase
    {
        [TestInitialize]
        public void InitTest() => Init();

        [DataTestMethod]
        [DataRow(false)]
        [DataRow(true)]
        public void Keeps_inline_references_together_before_a_nested_OneNote_list(bool updateHtml)
        {
            var controller = new VerseParsingController(
                ServiceProvider.GetRequiredService<IDocumentParserFactory>(),
                ServiceProvider.GetRequiredService<IVerseLinkService>(),
                ServiceProvider.GetRequiredService<IConfigurationManager>(),
                ServiceProvider.GetRequiredService<IApplicationManager>(),
                ServiceProvider.GetRequiredService<IModulesManager>(),
                ServiceProvider.GetRequiredService<IBibleParallelTranslationConnectorManager>());
            var html = "<div class=\"onenote-paragraph\">Раскрытие темы ("
                + "<a href=\"bnVerse:rst/52%205:16-18\">1Фес 5:16-18</a>, "
                + "<a href=\"bnVerse:rst/50%204:4-7\">Фил 4:4-7</a>)."
                + "<div class=\"onenote-children\"><div class=\"onenote-paragraph\">"
                + "<span>За всё благодарить (</span><a href=\"bnVerse:rst/50%204:5\"><span>Фил 4:5</span></a>"
                + "<span>, </span><a href=\"bnVerse:rst/52%205:18\"><span>1Фес 5:18</span></a><span>).</span>"
                + "<div class=\"onenote-children\"><div>Дочерний пункт: Ин 3:16</div></div>"
                + "</div></div></div>";
            var result = controller.ParsePage(new ParsePageRequest { Html = html, Module = "rst", UpdateHtml = updateHtml }).Value;

            result.Should().NotBeNull();
            result.Paragraphs.Select(paragraph => paragraph.Text).Should().Equal(
                "Раскрытие темы (1Фес 5:16-18, Фил 4:4-7).",
                "За всё благодарить (Фил 4:5, 1Фес 5:18).",
                "Дочерний пункт: Ин 3:16");
            result.Paragraphs.Select(paragraph => paragraph.References.Count).Should().Equal(2, 2, 1);
            foreach (var paragraph in result.Paragraphs)
                foreach (var reference in paragraph.References)
                    paragraph.Text.Substring(reference.StartIndex, reference.EndIndex - reference.StartIndex + 1)
                        .Should().Be(reference.OriginalText);
            result.Relations.Should().Contain(relation => relation.ParagraphIndex == result.Paragraphs[0].Index
                && relation.RelativeParagraphIndex == result.Paragraphs[0].Index);
            if (updateHtml)
            {
                // Temporary grouping must not add a wrapper to the saved document.
                result.Html.Should().Contain("class=\"onenote-paragraph\">Раскрытие темы (");
                result.Html.Should().NotContain("<span>Раскрытие темы");
                var repeated = controller.ParsePage(new ParsePageRequest { Html = result.Html, Module = "rst", UpdateHtml = true }).Value;
                HtmlComparison.NormalizeAttributeQuotes(repeated.Html)
                    .Should().Be(HtmlComparison.NormalizeAttributeQuotes(result.Html));
                repeated.Paragraphs.Select(paragraph => paragraph.Text)
                    .Should().Equal(result.Paragraphs.Select(paragraph => paragraph.Text));
            }
        }
    }
}
