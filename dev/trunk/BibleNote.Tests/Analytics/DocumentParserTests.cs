﻿using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Contracts.Environment;
using Microsoft.Practices.Unity;
using HtmlAgilityPack;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Tests.Analytics.Mocks;
using System.IO;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class DocumentParserTests
    {
        private MockDocumentProvider _mockDocumentProvider;        

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
            DIContainer.Container.RegisterInstance<IConfigurationManager>(new MockConfigurationManager());

            _mockDocumentProvider = new MockDocumentProvider() { IsReadonly = false };            
        }

        [TestCleanup]
        public void Done()
        {

        }

        // todo: [TestMethod]
        public void ParseLocalHtmlFile()
        {            
            using (var fs = new FileStream(@"..\..\Analytics\TestData\TestDocument1.html", FileMode.Open))
            {
                using (var sr = new StreamReader(fs))
                {
                    var htmlDoc = new HtmlDocument();
                    htmlDoc.LoadHtml(sr.ReadToEnd());
                    using (var docParser = DIContainer.Resolve<IDocumentParser>())
                    {
                        docParser.Init(_mockDocumentProvider);
                        using (docParser.ParseParagraph(htmlDoc.DocumentNode))
                        {

                        }
                    }
                }
            }
        }
    }
}
