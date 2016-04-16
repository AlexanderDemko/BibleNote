using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Contracts.Environment;
using Microsoft.Practices.Unity;
using HtmlAgilityPack;
using BibleNote.Analytics.Core.Helpers;
using BibleNote.Tests.Analytics.Mocks;
using System;
using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.Exceptions;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class ParagraphParserTests
    {
        public class TestResult
        {
            public HtmlDocument HtmlDoc { get; set; }
            public ParagraphParseResult Result { get; set; }
        }

        private MockDocumentProvider _mockDocumentProvider;
        private IConfigurationManager _mockConfigurationManager;
        private IParagraphParser _parahraphParserService;        
        private IVersePointerFactory _versePointerFactory;
        private IDocumentParseContext _documentParseContext;
        private IModulesManager _modulesManager;

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();

            _mockConfigurationManager = new MockConfigurationManager();            
            DIContainer.Container.RegisterInstance(_mockConfigurationManager);

            _modulesManager = DIContainer.Resolve<IModulesManager>();
            try
            {
                _modulesManager.GetCurrentModuleInfo();
            }
            catch (ModuleNotFoundException)
            {
                _modulesManager.UploadModule(@"..\..\..\Data\Modules\rst\rst.bnm", "rst");
                _modulesManager.UploadModule(@"..\..\..\Data\Modules\kjv\kjv.bnm", "kjv");
            }

            _documentParseContext = DIContainer.Resolve<IDocumentParseContext>();
            _versePointerFactory = DIContainer.Resolve<IVersePointerFactory>();
            _parahraphParserService = DIContainer.Resolve<IParagraphParser>();

            _mockDocumentProvider = new MockDocumentProvider();
            _parahraphParserService.Init(_mockDocumentProvider, _documentParseContext);
        }

        [TestCleanup]
        public void Done()
        {
            
        }

        private TestResult CheckVerses(string input, string expectedOutput, Action<IDocumentParseContext> initDocParseContext, params string[] verses)
        {
            if (string.IsNullOrEmpty(expectedOutput) || input == expectedOutput)
            {
                _mockDocumentProvider.IsReadonly = true;
                expectedOutput = input;
            }
            else
                _mockDocumentProvider.IsReadonly = false;

            _documentParseContext.ClearContext();
            if (initDocParseContext != null)
                initDocParseContext(_documentParseContext);            

            var htmlDoc = new HtmlDocument();
            htmlDoc.LoadHtml(input);

            var result = _parahraphParserService.ParseParagraph(htmlDoc.DocumentNode);          

            Assert.AreEqual(expectedOutput, htmlDoc.DocumentNode.InnerHtml, "The output html is wrong.");
            Assert.AreEqual(new HtmlToTextConverter().SimpleConvert(input), result.Text, "Text parts do not contain the full input string.");
            
            Assert.AreEqual(verses.Length, result.VerseEntries.Count, "Verses length is not the same. Expected: {0}. Found: {1}", verses.Length, result.VerseEntries.Count);

            var verseEntries = result.VerseEntries.Select(ve => ve.VersePointer);
            foreach (var verse in verses)
                Assert.IsTrue(verseEntries.Contains(_versePointerFactory.CreateVersePointer(verse)), "Can not find the verse: '{0}'", verse);

            return new TestResult() { HtmlDoc = htmlDoc, Result = result };
        }
        

        [TestMethod]
        public void TestScenario1()
        {
            var input = "<div>Это <p>тестовая <font>Мк 5:</font>6-7!!</p> строка</div>";
            var expected = "<div>Это <p>тестовая <font><a href='bnVerse:Марка 5:6-7'>Мк 5:6-7</a></font>!!</p> строка</div>";            
            var result = CheckVerses(input, expected, null, "Мк 5:6-7");

            var verseEntry = result.Result.VerseEntries.First();
            Assert.AreEqual("Мк 5:6-7", result.Result.Text.Substring(verseEntry.StartIndex, verseEntry.EndIndex - verseEntry.StartIndex + 1));
        }

        [TestMethod]
        public void TestScenario2()
        {
            var input = "<div>Это тестовая Ин 3:16 строка<BR/>с переводом строки. Лк<br />5:6 - это первая ссылка, <p>Лк<font>7</font>:<font>8 и ещё </font><font class='test'>Мк 5:</font>6-7!!</p> - это вторая<p><font></font></p><p>1</p></div>";
            var expected = "<div>Это тестовая <a href='bnVerse:Иоанна 3:16'>Ин 3:16</a> строка<br>с переводом строки. <a href='bnVerse:Луки 5:6'>Лк5:6</a><br> - это первая ссылка, <p><a href='bnVerse:Луки 7:8'>Лк7:8</a><font></font><font> и ещё </font><font class='test'><a href='bnVerse:Марка 5:6-7'>Мк 5:6-7</a></font>!!</p> - это вторая<p><font></font></p><p>1</p></div>";
            var result = CheckVerses(input, expected, null, "Ин 3:16", "Лк 5:6", "Лк 7:8", "Мк 5:6-7");

            var verseEntry = result.Result.VerseEntries[2];
            Assert.AreEqual("Лк7:8", result.Result.Text.Substring(verseEntry.StartIndex, verseEntry.EndIndex - verseEntry.StartIndex + 1));
            verseEntry = result.Result.VerseEntries.Last();
            Assert.AreEqual("Мк 5:6-7", result.Result.Text.Substring(verseEntry.StartIndex, verseEntry.EndIndex - verseEntry.StartIndex + 1));
        }

        [TestMethod]
        public void TestScenario3()
        {
            var input = @"<span
        lang=ru>&quot;С учением об уподоблении (отождествлении) связаны важные богословские истины. Верующий отождествляется с Христом в Его смерти (Рим. 6:1-</span><span
        style='font-weight:bold' lang=ru>11</span><span lang=ru>); погребении (Рим. 6:</span><span
        style='font-weight:bold' lang=ru>4</span><span style='font-weight:bold'
        lang=en-US>-6</span><span lang=ru>); в Его воскресении (Кол. </span><span
        style='background:yellow;mso-highlight:yellow' lang=ru>3:1</span><span lang=ru>); вознесении (Е</span><span
        style='color:#E84C22' lang=ru>ф. 2:6</span><span lang=ru>); в Его царстве (2 </span><span
        style='font-style:italic' lang=ru>Тим. 2:12</span><span lang=ru>) и в Его славе (</span><span
        style='text-decoration:underline' lang=ru>Рим. 8:17</span><span lang=ru>)</span><span
        lang=en-US> </span><span lang=ru>и </span><span style='font-weight:bold'
        lang=ru>*</span><span lang=ru>2Пет </span><span style='background:yellow;
        mso-highlight:yellow' lang=ru>1</span><span style='color:#E84C22' lang=ru>:</span><span
        style='font-weight:bold' lang=ru>5</span><span style='font-style:italic'
        lang=ru>-8</span><span style='font-weight:bold;font-style:italic' lang=ru>*</span><span
        lang=ru>&quot; (Джон Уолвурд)</span>";

            var expected = "<span lang=\"ru\">&quot;С учением об уподоблении (отождествлении) связаны важные богословские истины. Верующий отождествляется с Христом в Его смерти (<a href='bnVerse:Римлянам 6:1-11'>Рим. 6:1-11</a></span><span style='font-weight:bold' lang=\"ru\"></span><span lang=\"ru\">); погребении (<a href='bnVerse:Римлянам 6:4-6'>Рим. 6:4-6</a></span><span style='font-weight:bold' lang=\"ru\"></span><span style='font-weight:bold' lang=\"en-US\"></span><span lang=\"ru\">); в Его воскресении (<a href='bnVerse:Колоссянам 3:1'>Кол. 3:1</a></span><span style='background:yellow;mso-highlight:yellow' lang=\"ru\"></span><span lang=\"ru\">); вознесении (<a href='bnVerse:Ефесянам 2:6'>Еф. 2:6</a></span><span style='color:#E84C22' lang=\"ru\"></span><span lang=\"ru\">); в Его царстве (<a href='bnVerse:2Тимофею 2:12'>2 Тим. 2:12</a></span><span style='font-style:italic' lang=\"ru\"></span><span lang=\"ru\">) и в Его славе (</span><span style='text-decoration:underline' lang=\"ru\"><a href='bnVerse:Римлянам 8:17'>Рим. 8:17</a></span><span lang=\"ru\">)</span><span lang=\"en-US\"> </span><span lang=\"ru\">и </span><span style='font-weight:bold' lang=\"ru\">*</span><span lang=\"ru\"><a href='bnVerse:2Петра 1:5-8'>2Пет 1:5-8</a></span><span style='background:yellow;\r\n        mso-highlight:yellow' lang=\"ru\"></span><span style='color:#E84C22' lang=\"ru\"></span><span style='font-weight:bold' lang=\"ru\"></span><span style='font-style:italic' lang=\"ru\"></span><span style='font-weight:bold;font-style:italic' lang=\"ru\">*</span><span lang=\"ru\">&quot; (Джон Уолвурд)</span>";

            var result = CheckVerses(input, expected, null, "Рим. 6:1-11", "Рим. 6:4-6", "Кол. 3:1", "Еф. 2:6", "2 Тим. 2:12", "Рим. 8:17", "2Пет 1:5-8");
            Assert.AreEqual(VerseEntryOptions.ImportantVerse, result.Result.VerseEntries.Last().EntryOptions);
        }

        [TestMethod]
        public void TestScenario4()
        {
            var input = "<span>test <font>Лк 5: </font>6<font>-</font></span><span> 7<font>,</font> и ещё <font>:</font>8</span><span><font>,</font><font>9</font></span>";
            var expected = "<span>test <font><a href='bnVerse:Луки 5:6-7'>Лк 5: 6- 7</a></font><font></font></span><span><font>,</font> и ещё <font><a href='bnVerse:Луки 5:8'>:8</a></font></span><span><font>,</font><font><a href='bnVerse:Луки 5:9'>9</a></font></span>";

            CheckVerses(input, null, null, "Лк 5:6-7", "Лк 5:8", "Лк 5:9");
            CheckVerses(input, expected, null, "Лк 5:6-7", "Лк 5:8", "Лк 5:9");
        }

        [TestMethod]
        public void TestScenario5()
        {
            var input = "тест Лк 1:16, и 17 и 10:13-17;17-18; 19-20;  21-22;   23-24,11:1-2,3,  4-5,   6, и 7 тест и Мк 1:5 , 6  ,7 ,  8  , 9 и Ин 1:2 -3, Ин 2:3 - 4, Ин 3:4- 5, Ин 4:5  -6, Ин 5:6-  7, Ин 6:7  - 8, Ин 7:8 -  9, Ин 8:9   -10";
            var expected = "тест <a href='bnVerse:Луки 1:16'>Лк 1:16</a>, и 17 и <a href='bnVerse:Луки 10:13-17'>10:13-17</a>;<a href='bnVerse:Луки 17-18'>17-18</a>; <a href='bnVerse:Луки 19-20'>19-20</a>;  <a href='bnVerse:Луки 21-22'>21-22</a>;   23-24,<a href='bnVerse:Луки 11:1-2'>11:1-2</a>,<a href='bnVerse:Луки 11:3'>3</a>,  <a href='bnVerse:Луки 11:4-5'>4-5</a>,   6, и 7 тест и <a href='bnVerse:Марка 1:5'>Мк 1:5</a> , <a href='bnVerse:Марка 1:6'>6</a>  ,<a href='bnVerse:Марка 1:7'>7</a> ,  8  , 9 и <a href='bnVerse:Иоанна 1:2-3'>Ин 1:2 -3</a>, <a href='bnVerse:Иоанна 2:3-4'>Ин 2:3 - 4</a>, <a href='bnVerse:Иоанна 3:4-5'>Ин 3:4- 5</a>, <a href='bnVerse:Иоанна 4:5-6'>Ин 4:5  -6</a>, <a href='bnVerse:Иоанна 5:6-7'>Ин 5:6-  7</a>, <a href='bnVerse:Иоанна 6:7'>Ин 6:7</a>  - 8, <a href='bnVerse:Иоанна 7:8'>Ин 7:8</a> -  9, <a href='bnVerse:Иоанна 8:9'>Ин 8:9</a>   -10";

            CheckVerses(input, null, null, "Лк 1:16", "Лк 10:13-17", "Лк 17-18", "Лк 19-20", "Лк 21-22", "Лк 11:1-2", "Лк 11:3", "Лк 11:4-5", "Мк 1:5", "Мк 1:6", "Мк 1:7", "Ин 1:2-3", "Ин 2:3-4", "Ин 3:4-5", "Ин 4:5-6", "Ин 5:6-7", "Ин 6:7", "Ин 7:8", "Ин 8:9");
            CheckVerses(input, expected, null, "Лк 1:16", "Лк 10:13-17", "Лк 17-18", "Лк 19-20", "Лк 21-22", "Лк 11:1-2", "Лк 11:3", "Лк 11:4-5", "Мк 1:5", "Мк 1:6", "Мк 1:7", "Ин 1:2-3", "Ин 2:3-4", "Ин 3:4-5", "Ин 4:5-6", "Ин 5:6-7", "Ин 6:7", "Ин 7:8", "Ин 8:9");
        }

        [TestMethod]
        public void TestScenario6()
        {
            var input = "тест Лк 1:16, 10:13-17,18-19; 11:1-2 тест Мк 5,6 и Мк 5;6 и 7:8";
            var expected = "тест <a href='bnVerse:Луки 1:16'>Лк 1:16</a>, <a href='bnVerse:Луки 10:13-17'>10:13-17</a>,<a href='bnVerse:Луки 10:18-19'>18-19</a>; <a href='bnVerse:Луки 11:1-2'>11:1-2</a> тест <a href='bnVerse:Марка 5:6'>Мк 5,6</a> и <a href='bnVerse:Марка 5'>Мк 5</a>;<a href='bnVerse:Марка 6'>6</a> и <a href='bnVerse:Марка 7:8'>7:8</a>";

            CheckVerses(input, null, null, "Лк 1:16", "Лк 10:13-17", "Лк 10:18-19", "Лк 11:1-2", "Мк 5:6", "Мк 5", "Мк 6", "Мк 7:8");
            CheckVerses(input, expected, null, "Лк 1:16", "Лк 10:13-17", "Лк 10:18-19", "Лк 11:1-2", "Мк 5:6", "Мк 5", "Мк 6", "Мк 7:8");
        }

        [TestMethod]
        public void TestScenario7()
        {
            var input = "Этот тест из 1 Ин 1 был подготвлен в (:2) и :3-4 и в :7-6, _:8_ стихах. А в 2-е Ин 1:3-5,6 тоже интересная инфа о {:7}. И о 2Тим 1:1,2-3";

            var result = CheckVerses(input, null, null, "1Ин 1", "1Ин 1:2", "1Ин 1:3-4", "1Ин 1:7", "1Ин 1:8",
                "2Ин 1:3-5", "2Ин 1:6", "2Ин 1:7", "2Тим 1:1", "2Тим 1:2-3");

            Assert.AreEqual(VerseEntryOptions.IsExcluded, result.Result.VerseEntries[7].EntryOptions);
        }

        [TestMethod]
        public void TestScenario8()
        {
            CheckVerses("1 Лк 1:1, 2", /*"1 Лк 1:1,2"*/ null, null, "Лк 1:1", "Лк 1:2");
            CheckVerses("Ин1, Ин1:20", /*"Ин 1, Ин 1:20"*/ null, null, "Ин 1", "Ин 1:20");            
        }

        [TestMethod]
        public void TestScenario9()
        {
            var input = "Ин 1: вот и Отк 5(синодальный перевод) и Деяния 1:5,6: вот";
            
            CheckVerses(input, null, null, "Ин 1", "Отк 5", "Деян 1:5", "Деян 1:6");
        }

        [TestMethod]
        public void TestScenario10()
        {   
            CheckVerses("Ин 1:50-2:2,3-4", null, null, "Ин 1:50-2:2", "Ин 2:3-4");            
        }


        [TestMethod]
        public void TestScenario11()
        {
            var input = "2,3 и :1-2 как и в :3,4-5;6 и 7:8";            
            
            CheckVerses(input, null, 
                docParseContext => docParseContext.SetTitleVerse(_versePointerFactory.CreateVersePointer("1Кор 1")), 
                "1Кор 1:1-2", "1Кор 1:3", "1Кор 1:4-5", "1Кор 6", "1Кор 7:8");      // возможно, не надо поддерживать два последних VersePointer-a
        }

        [TestMethod]
        public void TestScenario12()
        {   
            CheckVerses("Ps 89:1-2", null, null, "Пс 88:1-3");
            CheckVerses("I Cor 6:7, II Tim 2:3", null, null, "1Кор 6:7", "2 Тим 2:3");
        }

        [TestMethod]
        public void TestScenario13()
        {
            var input = "В Ин 1,1 написано. И в 1,3 веке про это писали! Про :4 - тоже";

            _mockConfigurationManager.UseCommaDelimiter = false;
            CheckVerses(input, null, null, "Ин 1", "Ин 1:4");

            _mockConfigurationManager.UseCommaDelimiter = true;
            CheckVerses(input, null, null, "Ин 1:1", "Ин 1:4");
        }

        [TestMethod]
        public void TestScenario14()
        {
            var input = "в 1 Ин 1,2-3 и в Иисуса Навина 2-3 было написано про 1-е Кор 1,2-3,4-5;6-7,8-9,10 и в :7";

            // todo: а нужно ли всё таки менять написание стихов (добавлять/удалять пробелы)??
            //var expectedIfUseCommaDelimiter = "в 1 Ин 1:2-3 и в Иисуса Навина 2-3 было написано про 1-е Кор 1:2-3,4-5; 6-7, 8-9, 10 и в :7";
            //var expectedIfNotUseCommaDelimiter = "в 1 Ин 1, 2-3 и в Иисуса Навина 2-3 было написано про 1-е Кор 1, 2-3, 4-5; 6-7, 8-9, 10 и в :7";

            _mockConfigurationManager.UseCommaDelimiter = false;
            CheckVerses(input, null, null, "1 Ин 1", "1 Ин 2-3", "Нав 2-3", "1Кор 1", "1Кор 2-3",
                                "1Кор 4-5", "1Кор 6-7", "1Кор 8-9", "1Кор 10", "1Кор 10:7");

            _mockConfigurationManager.UseCommaDelimiter = true;
            CheckVerses(input, null, null, "1 Ин 1:2-3", "Нав 2-3",
                                "1Кор 1:2-3", "1Кор 1:4-5", "1Кор 6-7", "1Кор 8-9", "1Кор 10", "1Кор 10:7");            
        }

        [TestMethod]
        public void TestScenario15()
        {
            var input = "Ин 1,2,3 и ещё: Марка 1,2, 3: а потом Лк 1,2- 3 и Исх.19,11";
            var expectedIfNotUseCommaDelimiter = "<a href='bnVerse:Иоанна 1'>Ин 1</a>,<a href='bnVerse:Иоанна 2'>2</a>,<a href='bnVerse:Иоанна 3'>3</a> и ещё: <a href='bnVerse:Марка 1'>Марка 1</a>,<a href='bnVerse:Марка 2'>2</a>, <a href='bnVerse:Марка 3'>3</a>: а потом <a href='bnVerse:Луки 1'>Лк 1</a>,<a href='bnVerse:Луки 2-3'>2- 3</a> и <a href='bnVerse:Исход 19'>Исх.19</a>,11";
            var expectedIfUseCommaDelimiter = "<a href='bnVerse:Иоанна 1:2'>Ин 1,2</a>,<a href='bnVerse:Иоанна 1:3'>3</a> и ещё: <a href='bnVerse:Марка 1:2'>Марка 1,2</a>, <a href='bnVerse:Марка 1:3'>3</a>: а потом <a href='bnVerse:Луки 1:2-3'>Лк 1,2- 3</a> и <a href='bnVerse:Исход 19:11'>Исх.19,11</a>";

            _mockConfigurationManager.UseCommaDelimiter = false;
            CheckVerses(input, expectedIfNotUseCommaDelimiter, null, "Ин 1", "Ин 2", "Ин 3", "Мк 1", "Мк 2", "Мк 3", "Лк 1", "Лк 2-3", "Исх 19");

            _mockConfigurationManager.UseCommaDelimiter = true;
            CheckVerses(input, expectedIfUseCommaDelimiter, null, "Ин 1:2", "Ин 1:3", "Мк 1:2", "Мк 1:3", "Лк 1:2-3", "Исх 19:11");
        }

        [TestMethod]
        public void TestScenario16()
        {   
            var input = "<span lang=\"en\">1</span><span lang=\"ru\">И</span><span lang=\"ru\">н</span><span lang=\"ru\"> </span><span lang=\"ru\">1</span><span lang=\"ru\">:</span><span lang=\"ru\">1</span> и <span lang=\"ru\">:</span><span lang=\"ru\">7</span>";
            var expected = "<span lang=\"en\"><a href='bnVerse:1Иоанна 1:1'>1Ин 1:1</a></span><span lang=\"ru\"></span><span lang=\"ru\"></span><span lang=\"ru\"></span><span lang=\"ru\"></span><span lang=\"ru\"></span><span lang=\"ru\"></span> и <span lang=\"ru\"><a href='bnVerse:1Иоанна 1:7'>:7</a></span><span lang=\"ru\"></span>";
            
            CheckVerses(input, expected, null, "1Ин 1:1", "1Ин 1:7");
            CheckVerses(input, null, null, "1Ин 1:1", "1Ин 1:7");
        }

        [TestMethod]
        public void TestScenario17()
        {
            var input = "<span lang=ru>Исх. 13,1</span><span lang=ro>4</span><span lang=ru>,</span><span lang=se-FI>15</span><span lang=ru>,20.</span>";
            var expectedIfNotUseCommaDelimiter = "<span lang=\"ru\"><a href='bnVerse:Исход 13'>Исх. 13</a>,<a href='bnVerse:Исход 14'>14</a></span><span lang=\"ro\"></span><span lang=\"ru\">,</span><span lang=\"se-FI\"><a href='bnVerse:Исход 15'>15</a></span><span lang=\"ru\">,<a href='bnVerse:Исход 20'>20</a>.</span>";
            var expectedIfUseCommaDelimiter = "<span lang=\"ru\"><a href='bnVerse:Исход 13:14'>Исх. 13,14</a></span><span lang=\"ro\"></span><span lang=\"ru\">,</span><span lang=\"se-FI\"><a href='bnVerse:Исход 13:15'>15</a></span><span lang=\"ru\">,<a href='bnVerse:Исход 13:20'>20</a>.</span>";

            _mockConfigurationManager.UseCommaDelimiter = false;
            CheckVerses(input, expectedIfNotUseCommaDelimiter, null, "Исх 13", "Исх 14", "Исх 15", "Исх 20");

            _mockConfigurationManager.UseCommaDelimiter = true;
            CheckVerses(input, expectedIfUseCommaDelimiter, null, "Исх 13:14", "Исх 13:15", "Исх 13:20");
        }

        [TestMethod]
        public void TestScenario18()
        {
            var input = "<span lang=ru>Вот Ин 1</span><span lang=en-US>:</span><span lang=ru>12 где в </span><span lang=ro>:</span><span lang=se-FI>13</span>";
            var expected = "<span lang=\"ru\">Вот <a href='bnVerse:Иоанна 1:12'>Ин 1:12</a></span><span lang=\"en-US\"></span><span lang=\"ru\"> где в </span><span lang=\"ro\"><a href='bnVerse:Иоанна 1:13'>:13</a></span><span lang=\"se-FI\"></span>";
            
            CheckVerses(input, expected, null, "Ин 1:12", "Ин 1:13");
        }


        [TestMethod]
        public void TestScenario19()
        {   
            CheckVerses("Иуда 14,15", null, null, "Иуд 1:14", "Иуд 1:15");            
            CheckVerses("2Ин2,3Ин3", /*"2Ин 2,3Ин 3"*/ null, null, "2Ин 1:2", "3Ин 1:3");
        }

        [TestMethod]
        public void TestScenario20()
        {   
            CheckVerses("Ин 20:7-9, Л2", null, null, "Ин 20:7-9");
        }

        [TestMethod]
        public void TestScenario21()
        {
            var input = "Ис 43,4,45,5,46,7";
            var expectedIfNotUseCommaDelimiter = "<a href='bnVerse:Исаия 43'>Ис 43</a>,4,45,5,46,7";
            var expectedIfUseCommaDelimiter = "<a href='bnVerse:Исаия 43:4'>Ис 43,4</a>,<a href='bnVerse:Исаия 43:45'>45</a>,5,46,7";
            

            _mockConfigurationManager.UseCommaDelimiter = false;
            CheckVerses(input, expectedIfNotUseCommaDelimiter, null, "Ис 43");

            _mockConfigurationManager.UseCommaDelimiter = true;
            CheckVerses(input, expectedIfUseCommaDelimiter, null, "Ис 43:4", "Ис 43:45");
        }

        [TestMethod]
        public void TestScenario22()
        {
            var input = "Не понимает 'Луки 21-я глава', '1Кор. 1:29 ; 3:21; 4:7', 'В Первом послании к Коринфянам (10:31)'";
            var expected = "d";
            CheckVerses(input, expected, null, "Лк 21", "1Кор 1:29", "1Кор 3:21", "1Кор 4:7", "1Кор 10:31");
        }

        [TestMethod]
        public void TestScenario23()
        {
            CheckVerses(".-5 Ин 1:5,6: вот", null, null, "Ин 1:5", "Ин 1:6");
            CheckVerses(".:5 Ин.  (5 : 7), Лк.   (6:7)", null, null, "Ин 5:7", "Лк 6:7");            
        }

        [TestMethod]
        public void TestScenario24()
        {
            var input = "<b><b>Ин</b><b>3:16</b></b> <b>Лк<b>5:1<b/>6:2</b>";
            var expected = "<b><b><a href='bnVerse:Иоанна 3:16'>Ин3:16</a></b><b></b></b> <b><a href='bnVerse:Луки 5:16'>Лк5:16</a><b><b></b>:2</b></b>";
            
            CheckVerses(input, expected, null, "Ин 3:16", "Лк 5:16");
        }

        //todo: [TestMethod]
        public void TestScenario25()
        {   
            CheckVerses("Ин 5:6 и 7 стих, 8ст, ст9-11, ст.12,13", null, null, "Ин 5:6", "Ин 5:7", "Ин 5:8", "Ин 5:9-11", "Ин 5:12", "Ин 5:13");
        }
    }
}