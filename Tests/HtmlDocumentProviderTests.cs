using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using FluentAssertions;
using BibleNote.Analytics.Providers.Html;
using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Tests.Analytics.TestsBase;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Providers.Html.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class HtmlDocumentProviderTests : DocumentParserTestsBase
    {
        private IDocumentProvider _documentProvider;        

        [TestInitialize]
        public void Init()
        {
            base.Init(services => services
                .AddScoped<IHtmlDocumentConnector, HtmlDocumentConnector>()
                .AddScoped<IDocumentProvider, HtmlProvider>());            
            
            _documentProvider = ServiceProvider.GetService<IDocumentProvider>();            
        }

        [TestCleanup]
        public void Done()
        {

        }        

        [TestMethod]
        public void ParseHtml_Test1()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(0, @"..\..\..\TestData\Html_1.html", false));

            здесь куча ошибок.
            //    1. Если в title есть ссылка, то в первый раз он её преобразует в <a>, а во второй раз парсер не видит этой ссылки, так как нельзя, чтобы в title была ссылка. И надо бы добавить тест на это (тест, который будет копировать исходный файл, прогонять анализ и изменять его, а потом ещё раз анализ).
            //    2. Почему то только при третьем прогоне обнаружилась ссылка Ин 1:17. Хотя он вообще не должна обнаруживаться, если мы вынесли ссылку из Title
            //    3. При повторном прогоне не находится ссылка Евр 1:10.

            CheckParseResults(parseResult.GetAllParagraphParseResults().ToList(),
                new string[] { "Ин 1:1" },
                new string[] { "Исх 12:27" },
                new string[] { "Ин 1:50-2:3" },
                new string[] { "Ин 3:16", "1Кор 5:7-9" },
                new string[] { "Ис 44" },
                new string[] { "Ис 44:24" },
                new string[] { "Евр 1:2", "Евр 1:10" },
                new string[] { "Ис 44:6" },
                new string[] { "Ин 1:17" },
                new string[] { "Ис 44:5" },
                new string[] { "Ис 44:6" });

            parseResult.VersesCount.Should().Be(19);            
        }

        [TestMethod]
        public void ParseHtml_Test2()
        {
            var parseResult = _documentProvider.ParseDocument(new FileDocumentId(0, @"..\..\..\TestData\Html_2.html", true));

            CheckParseResults(parseResult.GetAllParagraphParseResults().ToList(),
                new string[] { "Ин 1" },
                new string[] { "Ин 2" },
                new string[] { "Ин 1:3" },
                new string[] { "Ин 2:4" },
                new string[] { "Ин 1:1" },
                new string[] { "Ин 2:2" });
        }
    }
}
