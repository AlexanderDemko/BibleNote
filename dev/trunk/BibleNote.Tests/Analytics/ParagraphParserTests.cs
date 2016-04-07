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

        private IParagraphParser _parahraphParserService;
        private IConfigurationManager _configurationManager;
        private IVersePointerFactory _verseParserService;
        private MockDocumentProvider _mockDocumentProvider;

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
            DIContainer.Container.RegisterInstance<IConfigurationManager>(new MockConfigurationManager());

            _mockDocumentProvider = new MockDocumentProvider();
            _parahraphParserService = DIContainer.Resolve<IParagraphParser>(new ParameterOverrides { { "documentProvider", _mockDocumentProvider } });
            _configurationManager = DIContainer.Resolve<IConfigurationManager>();
            _verseParserService = DIContainer.Resolve<IVersePointerFactory>();            
        }

        [TestCleanup]
        public void Done()
        {
            
        }

        private TestResult CheckVerses(string input, string expectedOutput, params string[] verses)
        {
            if (string.IsNullOrEmpty(expectedOutput))
            {
                _mockDocumentProvider.IsReadonly = true;
                expectedOutput = input;
            }
            else
                _mockDocumentProvider.IsReadonly = false;


            var htmlDoc = new HtmlDocument();
            htmlDoc.LoadHtml(input);

            var result = _parahraphParserService.ParseParagraph(htmlDoc.DocumentNode, null);
            
            Assert.AreEqual(expectedOutput, htmlDoc.DocumentNode.InnerHtml, "The output html is wrong.");
            Assert.AreEqual(StringUtils.GetText(input), string.Join(string.Empty, result.TextParts.Select(tp => tp.Text)), "Text parts do not contain the full input string.");

            var verseEntries = result.GetAllVerses().ToList();
            Assert.AreEqual(verses.Length, verseEntries.Count, "Verses length is not the same. Expected: {0}. Found: {1}", verses.Length, verseEntries.Count);            

            foreach (var verse in verses)
                Assert.IsTrue(verseEntries.Contains(_verseParserService.CreateVersePointer(verse)), "Can not find the verse: '{0}'", verse);

            return new TestResult() { HtmlDoc = htmlDoc, Result = result };
        }
        

        [TestMethod]
        public void TestScenario0()
        {
            var input = "<div>Это <p>тестовая <font>Мк 5:</font>6-7!!</p> строка</div>";
            var expected = "<div>Это <p>тестовая <font><a href='bnVerse:Марка 5:6-7'>Мк 5:6-7</a></font>!!</p> строка</div>";            
            var result = CheckVerses(input, expected, "Мк 5:6-7");

            var textPart = result.Result.TextParts[1];
            Assert.AreEqual("тестовая Мк 5:6-7!!", textPart.Text);
            var verseEntry = textPart.VerseEntries[0];
            Assert.AreEqual("Мк 5:6-7", textPart.Text.Substring(verseEntry.StartIndex, verseEntry.EndIndex - verseEntry.StartIndex + 1));

            input = "<div>Это тестовая Ин 3:16 строка<BR/>с переводом строки. Лк<br />5:6 - это первая ссылка, <p>Лк<font>7</font>:<font>8 и ещё </font><font class='test'>Мк 5:</font>6-7!!</p> - это вторая<p><font></font></p><p>1</p></div>";
            expected = "<div>Это тестовая <a href='bnVerse:Иоанна 3:16'>Ин 3:16</a> строка<br>с переводом строки. Лк<br>5:6 - это первая ссылка, <p><a href='bnVerse:Луки 7:8'>Лк7:8</a><font></font><font> и ещё </font><font class='test'><a href='bnVerse:Марка 5:6-7'>Мк 5:6-7</a></font>!!</p> - это вторая<p><font></font></p><p>1</p></div>";                       
            result = CheckVerses(input, expected, "Ин 3:16", "Лк 7:8", "Мк 5:6-7");

            Assert.AreEqual(6, result.Result.TextParts.Count);
        }

        [TestMethod]
        public void TestScenario1()
        {
            var input = "тест Лк 1:16, 10:13-17;18-19; 11:1-2 тест";            

            CheckVerses(input, null, "Лк 1:16", "Лк 10:13", "Лк 10:14", "Лк 10:15", "Лк 10:16",
                "Лк 10:17", "Лк 18", "Лк 19", "Лк 11:1", "Лк 11:2");
        }

        //[TestMethod]
        //public void TestScenario2()
        //{
        //    var input = "тест Лк 1:16, 10:13-17,18-19; 11:1-2 тест";

        //    CheckVerses(input, input, "Лк 1:16", "Лк 10:13", "Лк 10:14",
        //        "Лк 10:15", "Лк 10:16", "Лк 10:17", "Лк 10:18", "Лк 10:19", "Лк 11:1", "Лк 11:2");
        //}

        //[TestMethod]
        //public void TestScenario3()
        //{
        //    var input = "Этот тест из 1 Ин 1 был подготвлен в (:2) и :3-4 и в :7-6, _:8_ стихах. А в 2-е Ин 1:3-5,6 тоже интересная инфа о {:7}. И о 2Тим 1:1,2-3";

        //    CheckVerses(input, input, "1Ин 1", "1Ин 1:2", "1Ин 1:3", "1Ин 1:4", "1Ин 1:7", "1Ин 1:8",
        //        "2Ин 1:3", "2Ин 1:4", "2Ин 1:5", "2Ин 1:6", "2Ин 1:7", "2Тим 1:1", "2Тим 1:2", "2Тим 1:3");
        //}

        //        [TestMethod]
        //        public void TestScenario4()
        //        {
        //            var input = "1 Лк 1:1, 2";
        //            var expected = "1 Лк 1:1,2";

        //            CheckVerses(input, result, "Лк 1:1", "Лк 1:2");
        //        }

        //        [TestMethod]
        //        public void TestScenario5()
        //        {
        //            var input = "Ин 1: вот и Отк 5(синодальный перевод) и Деяния 1:5,6: вот";

        //            var result = ParseParagraph(input, null);
        //            CheckVerses(input, result, "Ин 1", "Отк 5", "Деян 1:5", "Деян 1:6");
        //        }

        //        [TestMethod]
        //        public void TestScenario6()
        //        {
        //            var input = "Ин 1:50-2:2,3-4";

        //            var result = ParseParagraph(input, null);
        //            CheckVerses(input, result, "Ин 1:50", "Ин 1:51", "Ин 2:1", "Ин 2:2", "Ин 2:3", "Ин 2:4");
        //        }

        //        [TestMethod]
        //        public void TestScenario7()
        //        {
        //            var input = "Ин 1:50-2:2,4-5";

        //            var result = ParseParagraph(input, null);
        //            CheckVerses(input, result, "Ин 1:50", "Ин 1:51", "Ин 2:1", "Ин 2:2", "Ин 2:4", "Ин 2:5");
        //        }

        //        [TestMethod]
        //        public void TestScenario8()
        //        {
        //            var input = ":1-2 как и в :3,4-5";

        //            var result = ParseParagraph(input, null);
        //            CheckVerses(input, result, "1Кор 1", "1Кор 1:1", "1Кор 1:2", "1Кор 1:3", "1Кор 1:4", "1Кор 1:5");
        //        }

        //        [TestMethod]
        //        public void TestScenario9()
        //        {
        //            var input = "Ps 89:1-2";

        //            var result = ParseParagraph(input, null);
        //            CheckVerses(input, result, "Пс 88:1", "Пс 88:2", "Пс 88:3");
        //        }

        //        [TestMethod]
        //        public void TestScenario10()
        //        {
        //            var input = "В Ин 1,1 написано. И в 1,2 веке про это писали! Про :2 - тоже";
        //            var expectedIfUseCommaDelimiter = "В Ин 1:1 написано. И в 1,2 веке про это писали! Про :2 - тоже";
        //            var expectedIfNotUseCommaDelimiter = "В Ин 1, 1 написано. И в 1,2 веке про это писали! Про :2 - тоже";

        //            var result = ParseParagraph(input, null);
        //            CheckVerses(
        //                _configurationManager.UseCommaDelimiter ? expectedIfUseCommaDelimiter : expectedIfNotUseCommaDelimiter,
        //                result,
        //                _configurationManager.UseCommaDelimiter
        //                    ? new string[] { "Ин 1:1", "Ин 1:2" }
        //                    : new string[] { "Ин 1", "Ин 1", "Ин 1:2" });
        //        }

        //        [TestMethod]
        //        public void TestScenario11()
        //        {
        //            var input = "в 1 Ин 1,2-3 и в Иисуса Навина 2-3 было написано про 1-е Кор 1,2-3,4-5;6-7,8-9,10 и в :7";
        //            var expectedIfUseCommaDelimiter = "в 1 Ин 1:2-3 и в Иисуса Навина 2-3 было написано про 1-е Кор 1:2-3,4-5; 6-7, 8-9, 10 и в :7";
        //            var expectedIfNotUseCommaDelimiter = "в 1 Ин 1, 2-3 и в Иисуса Навина 2-3 было написано про 1-е Кор 1, 2-3, 4-5; 6-7, 8-9, 10 и в :7";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(
        //                _configurationManager.UseCommaDelimiter ? expectedIfUseCommaDelimiter : expectedIfNotUseCommaDelimiter,
        //                result,
        //                _configurationManager.UseCommaDelimiter
        //                    ? new string[] { 
        //                        "1 Ин 1:2", "1 Ин 1:3", "Нав 2", "Нав 3", 
        //                        "1Кор 1:2", "1Кор 1:3", "1Кор 1:4", "1Кор 1:5", "1Кор 6", 
        //                        "1Кор 7", "1Кор 8", "1Кор 9", "1Кор 10", "1Кор 10:7" }
        //                    : new string[] { 
        //                        "1 Ин 1", "1 Ин 2", "1 Ин 3", "Нав 2", "Нав 3", "1Кор 1", "1Кор 2", "1Кор 3", 
        //                        "1Кор 4", "1Кор 5", "1Кор 6", "1Кор 7", "1Кор 8", "1Кор 9", "1Кор 10", "1Кор 10:7" });
        //        }

        //        [TestMethod]
        //        public void TestScenario12()
        //        {
        //            var input = "Ин 1,2,3 и ещё: Марка 1,2, 3: а потом Лк 1,2- 3";
        //            var expectedIfUseCommaDelimiter = "Ин 1:2,3 и ещё: Марка 1:2,3: а потом Лк 1:2-3";
        //            var expectedIfNotUseCommaDelimiter = "Ин 1, 2, 3 и ещё: Марка 1, 2, 3: а потом Лк 1, 2-3";

        //            var result = _parahraphParserService.ParseParagraph(input, null);

        //            CheckVerses(
        //                _configurationManager.UseCommaDelimiter ? expectedIfUseCommaDelimiter : expectedIfNotUseCommaDelimiter,
        //                result,
        //                _configurationManager.UseCommaDelimiter
        //                    ? new string[] { "Ин 1:2", "Ин 1:3", "Мк 1:2", "Мк 1:3", "Лк 1:2", "Лк 1:3" }
        //                    : new string[] { "Ин 1", "Ин 2", "Ин 3", "Мк 1", "Мк 2", "Мк 3", "Лк 1", "Лк 2", "Лк 3" });
        //        }

        //        [TestMethod]
        //        public void TestScenario13()
        //        {
        //            var input = "<span lang=en>1</span><span lang=ru>И</span><span lang=ru>н</span><span lang=ru> </span><span lang=ru>1</span><span lang=ru>:</span><span lang=ru>1</span> и <span lang=ru>:</span><span lang=ru>7</span>";
        //            var expected = "1Ин 1:1 и :7";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(expected, result, "1Ин 1:1", "1Ин 1:7");
        //        }

        //        [TestMethod]
        //        public void TestScenario14()
        //        {
        //            var input = "I Cor 6:7, II Tim 2:3";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(input, result, "1Кор 6:7", "2 Тим 2:3");
        //        }

        //        [TestMethod]
        //        public void TestScenario15()
        //        {
        //            var input = "<span lang=ru>Исх. 13,1</span><span lang=ro>4</span><span lang=ru>,</span><span lang=se-FI>15</span><span lang=ru>,20.</span>";
        //            var expectedIfUseCommaDelimiter = "Исх. 13:14,15,20.";
        //            var expectedIfNotUseCommaDelimiter = "Исх. 13, 14, 15, 20.";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(
        //                _configurationManager.UseCommaDelimiter ? expectedIfUseCommaDelimiter : expectedIfNotUseCommaDelimiter,
        //                result,
        //                _configurationManager.UseCommaDelimiter
        //                    ? new string[] { "Исх 13:14", "Исх 13:15", "Исх 13:20" }
        //                    : new string[] { "Исх 13", "Исх 14", "Исх 15", "Исх 20" });
        //        }

        //        [TestMethod]
        //        public void TestScenario16()
        //        {
        //            var input = "<span lang=ru>Вот Ин 1</span><span lang=en-US>:</span><span lang=ru>12 где в </span><span lang=ro>:</span><span lang=se-FI>13</span>";
        //            var expected = "Вот Ин 1:12 где в :13";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(expected, result, "Ин 1:12", "Ин 1:13");
        //        }


        //        [TestMethod]
        //        public void TestScenario17()
        //        {
        //            var input = "Иуда 14,15";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(input, result, "Иуд 1:14", "Иуд 1:15");
        //        }

        //        [TestMethod]
        //        public void TestScenario18()
        //        {
        //            var input = "Ин 20:7-9, Л2";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(input, result, "Ин 20:7", "Ин 20:8", "Ин 20:9");
        //        }

        //        [TestMethod]
        //        public void TestScenario19()
        //        {
        //            var input = "Ис 43,4,45,5,46,7";
        //            var expectedIfUseCommaDelimiter = "Ис 43:4, 45:5, 46:7";
        //            var expectedIfNotUseCommaDelimiter = "Ис 43, 4, 45, 5, 46, 7";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(
        //                _configurationManager.UseCommaDelimiter ? expectedIfUseCommaDelimiter : expectedIfNotUseCommaDelimiter,
        //                result,
        //                _configurationManager.UseCommaDelimiter
        //                    ? new string[] { "Ис 43:4", "Ис 45:5", "Ис 46:7" }
        //                    : new string[] { "Ис 43", "Ис 4", "Ис 45", "Ис 5", "Ис 46", "Ис 7" });
        //        }

        //        [TestMethod]
        //        public void TestScenario20()
        //        {
        //            var input = "Ин1, Ин1:20";
        //            var expected = "Ин 1, Ин 1:20";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(expected, result, "Ин 1", "Ин 1:20");
        //        }

        //        [TestMethod]
        //        public void TestScenario21()
        //        {
        //            var input = "2Ин2";
        //            var expected = "2Ин 2";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(expected, result, "2Ин 1:2");
        //        }

        //        [TestMethod]
        //        public void TestScenario22()
        //        {
        //            var input = "2Ин2,3Ин3";
        //            var expected = "2Ин 2,3Ин 3";
        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(expected, result, "2Ин 1:2", "3Ин 1:3");
        //        }

        //        [TestMethod]
        //        public void TestScenario23()
        //        {
        //            var input = "Исх.19,11";
        //            var expectedIfUseCommaDelimiter = "Исх. 19:11";
        //            var expectedIfNotUseCommaDelimiter = "Исх. 19, 11";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(
        //                _configurationManager.UseCommaDelimiter ? expectedIfUseCommaDelimiter : expectedIfNotUseCommaDelimiter,
        //                result,
        //                _configurationManager.UseCommaDelimiter
        //                    ? new string[] { "Исх 19:11" }
        //                    : new string[] { "Исх 19", "Исх 11" });
        //        }

        [TestMethod]
        public void TestScenario24()
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

            var expected = "<span lang=\"ru\">&quot;С учением об уподоблении (отождествлении) связаны важные богословские истины. Верующий отождествляется с Христом в Его смерти (<a href='bnVerse:Римлянам 6:1-11'>Рим. 6:1-11</a></span><span style='font-weight:bold' lang=\"ru\"></span><span lang=\"ru\">); погребении (<a href='bnVerse:Римлянам 6:4-0'>Рим. 6:4-6</a></span><span style='font-weight:bold' lang=\"ru\"></span><span style='font-weight:bold' lang=\"en-US\"></span><span lang=\"ru\">); в Его воскресении (<a href='bnVerse:Колоссянам 3:1'>Кол. 3:1</a></span><span style='background:yellow;mso-highlight:yellow' lang=\"ru\"></span><span lang=\"ru\">); вознесении (<a href='bnVerse:Ефесянам 2:6'>Еф. 2:6</a></span><span style='color:#E84C22' lang=\"ru\"></span><span lang=\"ru\">); в Его царстве (<a href='bnVerse:2Тимофею 2:12'>2 Тим. 2:12</a></span><span style='font-style:italic' lang=\"ru\"></span><span lang=\"ru\">) и в Его славе (</span><span style='text-decoration:underline' lang=\"ru\"><a href='bnVerse:Римлянам 8:17'>Рим. 8:17</a></span><span lang=\"ru\">)</span><span lang=\"en-US\"> </span><span lang=\"ru\">и </span><span style='font-weight:bold' lang=\"ru\">*</span><span lang=\"ru\"><a href='bnVerse:2Петра 1:5-8'>2Пет 1:5-8</a></span><span style='background:yellow;\r\n        mso-highlight:yellow' lang=\"ru\"></span><span style='color:#E84C22' lang=\"ru\"></span><span style='font-weight:bold' lang=\"ru\"></span><span style='font-style:italic' lang=\"ru\"></span><span style='font-weight:bold;font-style:italic' lang=\"ru\">*</span><span lang=\"ru\">&quot; (Джон Уолвурд)</span>";

            var result = CheckVerses(input, expected, "Рим. 6:1-11", "Рим. 6:4-6", "Кол. 3:1", "Еф. 2:6", "2 Тим. 2:12", "Рим. 8:17", "2Пет 1:5-8");
            Assert.IsTrue(result.Result.TextParts[0].VerseEntries.Last().VerseEntryOptions == VerseEntryOptions.ImportantVerse);
        }

        //        [TestMethod]
        //        public void TestScenario25()
        //        {
        //            var input = "Не понимает 'Луки 21-я глава', '1Кор. 1:29 ; 3:21; 4:7', 'В Первом послании к Коринфянам (10:31)'";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(input, result, "Лк 21", "1Кор 1:29", "1Кор 3:21", "1Кор 4:7", "1Кор 10:31");
        //        }

        //        [TestMethod]
        //        public void TestScenario26()
        //        {
        //            var input = ".-5 Ин 1:5,6: вот";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(input, result, "Ин 1:5", "Ин 1:6");
        //        }

        //        [TestMethod]
        //        public void TestScenario27()
        //        {
        //            var input = ".:5 Ин.  (5 : 7), Лк.   (6:7)";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(input, result, "Ин 5:7");
        //        }

        //        [TestMethod]
        //        public void TestScenario28()
        //        {
        //            var input = "<b><b>Ин</b><b>3:16</b></b> <b>Лк<b>5:1<b/>6:2</b>";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(input, result, "Ин 3:16");
        //        }

        //        [TestMethod]
        //        public void TestScenario29()
        //        {
        //            var input = "Ин 5:6 и 7 стих, 8ст, ст9-11, ст.12,13";

        //            var result = _parahraphParserService.ParseParagraph(input, null);
        //            CheckVerses(input, result, "Ин 5:6", "Ин 5:7", "Ин 5:8", "Ин 5:9", "Ин 5:10", "Ин 5:11", "Ин 5:12", "Ин 5:13");
        //        }
    }
}