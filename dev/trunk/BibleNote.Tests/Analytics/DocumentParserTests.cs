﻿using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Contracts.Environment;
using Microsoft.Practices.Unity;
using HtmlAgilityPack;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Tests.Analytics.Mocks;
using System.IO;
using FluentAssertions;
using System;
using BibleNote.Analytics.Providers.HtmlProvider;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Providers.FileNavigationProvider;
using BibleNote.Analytics.Services.VerseParsing;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class DocumentParserTests
    {
        private IDocumentProvider _documentProvider;
        private IDocumentParserFactory _documentParserFactory;

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
            DIContainer.Container.RegisterInstance<IConfigurationManager>(new MockConfigurationManager());

            _documentProvider = new MockDocumentProvider();
            _documentParserFactory = DIContainer.Resolve<IDocumentParserFactory>();
        }

        [TestCleanup]
        public void Done()
        {

        }

        [TestMethod]
        public void ParseLocalHtmlFile()
        {
            using (var docParser = _documentParserFactory.Create(_documentProvider))
            {
                //using (docParser.ParseParagraph())
                //{

                //}
            }
        }
    }
}
