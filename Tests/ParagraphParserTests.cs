using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Tests.Analytics.Mocks;
using System;
using BibleNote.Analytics.Providers.Html;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.VerseParsing;
using BibleNote.Analytics.Services.VerseParsing.Models;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseContext;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using DocumentFormat.OpenXml.Vml.Spreadsheet;
using BibleNote.Analytics.Providers.FileSystem.DocumentId;
using ICSharpCode.SharpZipLib.Zip.Compression.Streams;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class ParagraphParserTests : TestsBase.TestsBase
    {
        public class TestResult
        {
            public IXmlNode Node { get; set; }
            public ParagraphParseResult Result { get; set; }
        }

        private MockDocumentProviderInfo documentProvider;
        private IDocumentParserFactory documentParserFactory;        
        private IVersePointerFactory versePointerFactory;
        private IDocumentParseContextEditor documentParseContext;

        [TestInitialize]
        public void Init()
        {
            documentParseContext = new DocumentParseContext();
            base.Init(services => services.AddScoped(sp => documentParseContext));

            documentProvider = new MockDocumentProviderInfo(ServiceProvider.GetService<IVerseLinkService>());
            versePointerFactory = ServiceProvider.GetService<IVersePointerFactory>();                        
            documentParserFactory = ServiceProvider.GetService<IDocumentParserFactory>();                        
        }

        [TestCleanup]
        public void Done()
        {

        }

        private TestResult CheckVerses(string input, string expectedOutput, Action<IDocumentParseContextEditor> initDocParseContext, string[] notFoundVerses, params string[] verses)
        {
            var isReadonly = false;
            if (string.IsNullOrEmpty(expectedOutput))
            {
                isReadonly = true;
                expectedOutput = input;
            }

            var mockDocumentId = new FileDocumentId(0, null, isReadonly);

            if (verses == null)
                verses = new string[0];
            
            initDocParseContext?.Invoke(documentParseContext);

            var htmlDoc = new HtmlNodeWrapper(input);
            ParagraphParseResult result;            
            using (var docParser = this.documentParserFactory.Create(documentProvider, mockDocumentId))
            {                
                result = docParser.ParseParagraph(htmlDoc);                
            }

            Assert.AreEqual(verses.Length, result.VerseEntries.Count, "Verses length is not the same. Expected: {0}. Found: {1}", verses.Length, result.VerseEntries.Count);            
            var versePointers = result.VerseEntries.Select(ve => ve.VersePointer);
            foreach (var verse in verses)
                Assert.IsTrue(versePointers.Contains(this.versePointerFactory.CreateVersePointer(verse)), "Can not find the verse: '{0}'", verse);            

            Assert.AreEqual(expectedOutput, htmlDoc.InnerXml, "The output html is wrong.");
            Assert.AreEqual(new HtmlToTextConverter().SimpleConvert(input).Replace("&nbsp;", " "), result.Text, "Text parts do not contain the full input string.");

            if (notFoundVerses != null)
            {   
                Assert.AreEqual(notFoundVerses.Length, result.NotFoundVerses.Count);
                foreach (var verse in notFoundVerses)
                    Assert.IsTrue(result.NotFoundVerses.Contains(this.versePointerFactory.CreateVersePointer(verse)));
            }

            return new TestResult() { Node = htmlDoc, Result = result };
        }

        private TestResult CheckVerses(string input, string expectedOutput, Action<IDocumentParseContextEditor> initDocParseContext, params string[] verses)
        {
            return CheckVerses(input, expectedOutput, initDocParseContext, null, verses);
        }


        [TestMethod]
        public void Test1()
        {
            var input = "<div>Это <p>тестовая <font>Мк 5:</font>6-7!!</p> строка</div>";
            var expected = "<div>Это <p>тестовая <font><a href='bnVerse:Марка 5:6-7'>Мк 5:6-7</a></font>!!</p> строка</div>";
            var result = CheckVerses(input, expected, null, "Мк 5:6-7");

            var verseEntry = result.Result.VerseEntries.First();
            Assert.AreEqual("Мк 5:6-7", result.Result.Text.Substring(verseEntry.StartIndex, verseEntry.EndIndex - verseEntry.StartIndex + 1));
        }

        [TestMethod]
        public void Test2()
        {
            var input = "<div><p>Мк 1:2</p><p>Это тестовая Ин 3:16 строка<BR/>с переводом строки. Лк<br />5:6 - это первая ссылка, <p>Лк<font>7</font>:<font>8 и ещё </font><font class='test'>Мк 5:</font>6-7!!</p> - это вторая<p><font></font></p><p>1</p></p></div>";
            var expected = "<div><p><a href='bnVerse:Марка 1:2'>Мк 1:2</a></p><p>Это тестовая <a href='bnVerse:Иоанна 3:16'>Ин 3:16</a> строка<br>с переводом строки. <a href='bnVerse:Луки 5:6'>Лк5:6</a><br> - это первая ссылка, <p><a href='bnVerse:Луки 7:8'>Лк7:8</a><font></font><font> и ещё </font><font class='test'><a href='bnVerse:Марка 5:6-7'>Мк 5:6-7</a></font>!!</p> - это вторая<p><font></font></p><p>1</p></div>";
            var result = CheckVerses(input, expected, null, "Мк 1:2", "Ин 3:16", "Лк 5:6", "Лк 7:8", "Мк 5:6-7");

            var verseEntry = result.Result.VerseEntries[3];
            Assert.AreEqual("Лк7:8", result.Result.Text.Substring(verseEntry.StartIndex, verseEntry.EndIndex - verseEntry.StartIndex + 1));
            verseEntry = result.Result.VerseEntries.Last();
            Assert.AreEqual("Мк 5:6-7", result.Result.Text.Substring(verseEntry.StartIndex, verseEntry.EndIndex - verseEntry.StartIndex + 1));
        }

        [TestMethod]
        public void Test3()
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
        public void Test4()
        {
            var input = "<span>test <font>Лк 5: </font>6<font>-</font></span><span> 7<font>,</font> и ещё <font>:</font>8</span><span><font>,</font><font>9</font></span>";
            var expected = "<span>test <font><a href='bnVerse:Луки 5:6-7'>Лк 5: 6- 7</a></font><font></font></span><span><font>,</font> и ещё <font><a href='bnVerse:Луки 5:8'>:8</a></font></span><span><font>,</font><font><a href='bnVerse:Луки 5:9'>9</a></font></span>";

            CheckVerses(input, null, null, "Лк 5:6-7", "Лк 5:8", "Лк 5:9");
            CheckVerses(input, expected, null, "Лк 5:6-7", "Лк 5:8", "Лк 5:9");
        }

        [TestMethod]
        public void Test5()
        {
            var input = "тест Лк 1:16, и 17 и 10:13-17;17-18; 19-20;  21-22;   23-24,11:1-2,3,  4-5,   6, и 7 тест и Мк 1:5 , 6  ,7 ,  8  , 9 и Ин 1:2 -3, Ин 2:3 - 4, Ин 3:4- 5, Ин 4:5  -6, Ин 5:6-  7, Ин 6:7  - 8, Ин 7:8 -  9, Ин 8:9   -10";
            var expected = "тест <a href='bnVerse:Луки 1:16'>Лк 1:16</a>, и 17 и <a href='bnVerse:Луки 10:13-17'>10:13-17</a>;<a href='bnVerse:Луки 17-18'>17-18</a>; <a href='bnVerse:Луки 19-20'>19-20</a>;  <a href='bnVerse:Луки 21-22'>21-22</a>;   23-24,<a href='bnVerse:Луки 11:1-2'>11:1-2</a>,<a href='bnVerse:Луки 11:3'>3</a>,  <a href='bnVerse:Луки 11:4-5'>4-5</a>,   6, и 7 тест и <a href='bnVerse:Марка 1:5'>Мк 1:5</a> , <a href='bnVerse:Марка 1:6'>6</a>  ,<a href='bnVerse:Марка 1:7'>7</a> ,  8  , 9 и <a href='bnVerse:Иоанна 1:2-3'>Ин 1:2 -3</a>, <a href='bnVerse:Иоанна 2:3-4'>Ин 2:3 - 4</a>, <a href='bnVerse:Иоанна 3:4-5'>Ин 3:4- 5</a>, <a href='bnVerse:Иоанна 4:5-6'>Ин 4:5  -6</a>, <a href='bnVerse:Иоанна 5:6-7'>Ин 5:6-  7</a>, <a href='bnVerse:Иоанна 6:7'>Ин 6:7</a>  - 8, <a href='bnVerse:Иоанна 7:8'>Ин 7:8</a> -  9, <a href='bnVerse:Иоанна 8:9'>Ин 8:9</a>   -10";

            CheckVerses(input, null, null, "Лк 1:16", "Лк 10:13-17", "Лк 17-18", "Лк 19-20", "Лк 21-22", "Лк 11:1-2", "Лк 11:3", "Лк 11:4-5", "Мк 1:5", "Мк 1:6", "Мк 1:7", "Ин 1:2-3", "Ин 2:3-4", "Ин 3:4-5", "Ин 4:5-6", "Ин 5:6-7", "Ин 6:7", "Ин 7:8", "Ин 8:9");
            CheckVerses(input, expected, null, "Лк 1:16", "Лк 10:13-17", "Лк 17-18", "Лк 19-20", "Лк 21-22", "Лк 11:1-2", "Лк 11:3", "Лк 11:4-5", "Мк 1:5", "Мк 1:6", "Мк 1:7", "Ин 1:2-3", "Ин 2:3-4", "Ин 3:4-5", "Ин 4:5-6", "Ин 5:6-7", "Ин 6:7", "Ин 7:8", "Ин 8:9");
        }

        [TestMethod]
        public void Test6()
        {
            var input = "тест Лк 1:16, 10:13-17,18-19; 11:1-2 тест Мк 5,6 и Мк 5;6 и 7:8";
            var expected = "тест <a href='bnVerse:Луки 1:16'>Лк 1:16</a>, <a href='bnVerse:Луки 10:13-17'>10:13-17</a>,<a href='bnVerse:Луки 10:18-19'>18-19</a>; <a href='bnVerse:Луки 11:1-2'>11:1-2</a> тест <a href='bnVerse:Марка 5:6'>Мк 5,6</a> и <a href='bnVerse:Марка 5'>Мк 5</a>;<a href='bnVerse:Марка 6'>6</a> и <a href='bnVerse:Марка 7:8'>7:8</a>";

            CheckVerses(input, null, null, "Лк 1:16", "Лк 10:13-17", "Лк 10:18-19", "Лк 11:1-2", "Мк 5:6", "Мк 5", "Мк 6", "Мк 7:8");
            CheckVerses(input, expected, null, "Лк 1:16", "Лк 10:13-17", "Лк 10:18-19", "Лк 11:1-2", "Мк 5:6", "Мк 5", "Мк 6", "Мк 7:8");
        }

        [TestMethod]
        public void Test7()
        {
            var input = "Этот тест из 1 Ин 1 был подготвлен в (:2) и :3-4 и в :7-6, _:8_ стихах. А в 2-е Ин 1:3-5,6 тоже интересная инфа о {:7}. И о 2Тим 1:1,2-3";

            var result = CheckVerses(input, null, null, "1Ин 1", "1Ин 1:2", "1Ин 1:3-4", "1Ин 1:7", "1Ин 1:8",
                "2Ин 1:3-5", "2Ин 1:6", "2Ин 1:7", "2Тим 1:1", "2Тим 1:2-3");

            Assert.AreEqual(VerseEntryOptions.IsExcluded, result.Result.VerseEntries[7].EntryOptions);
        }

        [TestMethod]
        public void Test8()
        {
            CheckVerses("1 Лк 1:1, 2", /*"1 Лк 1:1,2"*/ null, null, "Лк 1:1", "Лк 1:2");
            CheckVerses("Ин1, Ин1:20", /*"Ин 1, Ин 1:20"*/ null, null, "Ин 1", "Ин 1:20");
        }

        [TestMethod]
        public void Test9()
        {
            var input = "Ин 1: вот и Отк 5(синодальный перевод) и Деяния 1:5,6: вот 1 Пет. 3:7";

            CheckVerses(input, null, null, "Ин 1", "Отк 5", "Деян 1:5", "Деян 1:6", "1Пет 3:7");
        }

        [TestMethod]
        public void Test10()
        {
            CheckVerses("Ин 1:50-2:2,3-4", null, null, "Ин 1:50-2:2", "Ин 2:3-4");
        }


        [TestMethod]
        public void Test11()
        {
            var input = "2,3 и :1-2 как и в :3,4-5;6 и 7:8";

            CheckVerses(input, null,
                docParseContext => docParseContext.SetTitleVerse(new ChapterEntry(versePointerFactory.CreateVersePointer("1Кор 1").ToChapterPointer())),
                "1Кор 1:1-2", "1Кор 1:3", "1Кор 1:4-5", "1Кор 6", "1Кор 7:8");      // todo: возможно, не надо поддерживать два последних VersePointer-a

            CheckVerses(input, null,
                docParseContext => docParseContext.SetTitleVerse(new ChapterEntry(versePointerFactory.CreateVersePointer("1Кор 1:1").ToChapterPointer())),
                "1Кор 1:1-2", "1Кор 1:3", "1Кор 1:4-5", "1Кор 6", "1Кор 7:8");      

            CheckVerses(input, null,
                docParseContext => docParseContext.SetTitleVerse(new ChapterEntry(versePointerFactory.CreateVersePointer("1Кор 1:1-2").ToChapterPointer())),
                "1Кор 1:1-2", "1Кор 1:3", "1Кор 1:4-5", "1Кор 6", "1Кор 7:8");      

            Action action = () => CheckVerses(input, null,
                docParseContext => docParseContext.SetTitleVerse(new ChapterEntry(versePointerFactory.CreateVersePointer("1Кор 1-2").ToChapterPointer())));
            action.Should().Throw<InvalidOperationException>("Must be only one chapter in verse.");
        }

        [TestMethod]
        public void Test12()
        {
            CheckVerses("Lev 28", null, null, new string[] { "Lev 28" }, null);           
            CheckVerses("Ps 75:10-11", "<a href='bnVerse:Псалтирь 74:11'>Ps 75:10-11</a>", null, new string[] { "Ps 75:11" }, "Псалтирь 74:11");
            CheckVerses("Ps 115:12-19", "<a href='bnVerse:Псалтирь 113:20-26'>Ps 115:12-19</a>", null, new string[] { "Ps 115:19" }, "Пс 113:20-26");
            CheckVerses("Ps 89:1-2, Lev 14:56-57, Lev 14:57, Ps 19:5", null, null, "Пс 88:1-3", "Лев 14:55-56", "Лев 14:56", "Пс 18:6");
            CheckVerses("I Cor 6:7, II Tim 2:3, I Sa 3:5, i Sa 3:6", null, null, "1Кор 6:7", "2 Тим 2:3", "1 Царств 3:5", "1 Царств 3:6");
            CheckVerses("Ps 75:1", "<a href='bnVerse:Псалтирь 74:1-2'>Ps 75:1</a>", null, "Пс 74:1-2");
            CheckVerses("Ps 75:1", "<a href='bnVerse:Псалтирь 74:1-2'>Ps 75:1</a>", null, "Пс 74:1-2");            
            CheckVerses("Lev 14:55-58", null, null, new string[] { "Lev 14:58" }, "Лев 14:55-56");
            CheckVerses("Lev 14:56-58", null, null, new string[] { "Lev 14:58" }, "Лев 14:55-56");
            CheckVerses("Lev 14:54-58", null, null, new string[] { "Lev 14:58" }, "Лев 14:54-56");
            CheckVerses("Lev 26-28", null, null, new string[] { "Lev 28" }, "Лев 26-27");
            CheckVerses("Lev 27-28", null, null, new string[] { "Lev 28" }, "Лев 27");
            CheckVerses("Jude 20-26", null, null, new string[] { "Jude 1:26" }, "Jude 1:20-25");
        }

        [TestMethod]
        public void Test13()
        {
            var input = "В Ин 1,1 написано. И в 1,3 веке про это писали! Про :4 - тоже";

            MockConfigurationManager.UseCommaDelimiter = false;
            CheckVerses(input, null, null, "Ин 1", "Ин 1:4");

            MockConfigurationManager.UseCommaDelimiter = true;
            CheckVerses(input, null, null, "Ин 1:1", "Ин 1:4");
        }

        [TestMethod]
        public void Test14()
        {
            var input = "в 1 Ин 1,2-3 и в Иисуса Навина 2-3 было написано про 1-е Кор 1,2-3,4-5;6-7,8-9,10 и в :7. Ин1,1 и Ин 2,1";

            // todo: а нужно ли всё таки менять написание стихов (добавлять/удалять пробелы)?? - надо вынести в опцию на уровне INavigationProviderInstance
            //var expectedIfUseCommaDelimiter = "в 1 Ин 1:2-3 и в Иисуса Навина 2-3 было написано про 1-е Кор 1:2-3,4-5; 6-7, 8-9, 10 и в :7";
            //var expectedIfNotUseCommaDelimiter = "в 1 Ин 1, 2-3 и в Иисуса Навина 2-3 было написано про 1-е Кор 1, 2-3, 4-5; 6-7, 8-9, 10 и в :7";

            MockConfigurationManager.UseCommaDelimiter = false;
            CheckVerses(input, null, null, "1 Ин 1", "1 Ин 2-3", "Нав 2-3", "1Кор 1", "1Кор 2-3",
                                "1Кор 4-5", "1Кор 6-7", "1Кор 8-9", "1Кор 10", "1Кор 10:7", "Ин 1", "Ин 2");

            MockConfigurationManager.UseCommaDelimiter = true;
            CheckVerses(input, null, null, "1 Ин 1:2-3", "Нав 2-3",
                                "1Кор 1:2-3", "1Кор 1:4-5", "1Кор 6-7", "1Кор 8-9", "1Кор 10", "1Кор 10:7", "Ин 1:1", "Ин 2:1");
        }

        [TestMethod]
        public void Test15()
        {
            var input = "Ин 1,2,3 и ещё: Марка 1,2, 3: а потом Лк 1,2- 3 и Исх.19,11";
            var expectedIfNotUseCommaDelimiter = "<a href='bnVerse:Иоанна 1'>Ин 1</a>,<a href='bnVerse:Иоанна 2'>2</a>,<a href='bnVerse:Иоанна 3'>3</a> и ещё: <a href='bnVerse:Марка 1'>Марка 1</a>,<a href='bnVerse:Марка 2'>2</a>, <a href='bnVerse:Марка 3'>3</a>: а потом <a href='bnVerse:Луки 1'>Лк 1</a>,<a href='bnVerse:Луки 2-3'>2- 3</a> и <a href='bnVerse:Исход 19'>Исх.19</a>,11";
            var expectedIfUseCommaDelimiter = "<a href='bnVerse:Иоанна 1:2'>Ин 1,2</a>,<a href='bnVerse:Иоанна 1:3'>3</a> и ещё: <a href='bnVerse:Марка 1:2'>Марка 1,2</a>, <a href='bnVerse:Марка 1:3'>3</a>: а потом <a href='bnVerse:Луки 1:2-3'>Лк 1,2- 3</a> и <a href='bnVerse:Исход 19:11'>Исх.19,11</a>";

            MockConfigurationManager.UseCommaDelimiter = false;
            CheckVerses(input, expectedIfNotUseCommaDelimiter, null, "Ин 1", "Ин 2", "Ин 3", "Мк 1", "Мк 2", "Мк 3", "Лк 1", "Лк 2-3", "Исх 19");

            MockConfigurationManager.UseCommaDelimiter = true;
            CheckVerses(input, expectedIfUseCommaDelimiter, null, "Ин 1:2", "Ин 1:3", "Мк 1:2", "Мк 1:3", "Лк 1:2-3", "Исх 19:11");
        }

        [TestMethod]
        public void Test16()
        {
            var input = "<span lang=\"en\">1</span><span lang=\"ru\">И</span><span lang=\"ru\">н</span><span lang=\"ru\"> </span><span lang=\"ru\">1</span><span lang=\"ru\">:</span><span lang=\"ru\">1</span> и <span lang=\"ru\">:</span><span lang=\"ru\">7</span>";
            var expected = "<span lang=\"en\"><a href='bnVerse:1Иоанна 1:1'>1Ин 1:1</a></span><span lang=\"ru\"></span><span lang=\"ru\"></span><span lang=\"ru\"></span><span lang=\"ru\"></span><span lang=\"ru\"></span><span lang=\"ru\"></span> и <span lang=\"ru\"><a href='bnVerse:1Иоанна 1:7'>:7</a></span><span lang=\"ru\"></span>";

            CheckVerses(input, expected, null, "1Ин 1:1", "1Ин 1:7");
            CheckVerses(input, null, null, "1Ин 1:1", "1Ин 1:7");
        }

        [TestMethod]
        public void Test17()
        {
            var input = "<span lang=ru>Исх. 13,1</span><span lang=ro>4</span><span lang=ru>,</span><span lang=se-FI>15</span><span lang=ru>,20.</span>";
            var expectedIfNotUseCommaDelimiter = "<span lang=\"ru\"><a href='bnVerse:Исход 13'>Исх. 13</a>,<a href='bnVerse:Исход 14'>14</a></span><span lang=\"ro\"></span><span lang=\"ru\">,</span><span lang=\"se-FI\"><a href='bnVerse:Исход 15'>15</a></span><span lang=\"ru\">,<a href='bnVerse:Исход 20'>20</a>.</span>";
            var expectedIfUseCommaDelimiter = "<span lang=\"ru\"><a href='bnVerse:Исход 13:14'>Исх. 13,14</a></span><span lang=\"ro\"></span><span lang=\"ru\">,</span><span lang=\"se-FI\"><a href='bnVerse:Исход 13:15'>15</a></span><span lang=\"ru\">,<a href='bnVerse:Исход 13:20'>20</a>.</span>";

            MockConfigurationManager.UseCommaDelimiter = false;
            CheckVerses(input, expectedIfNotUseCommaDelimiter, null, "Исх 13", "Исх 14", "Исх 15", "Исх 20");

            MockConfigurationManager.UseCommaDelimiter = true;
            CheckVerses(input, expectedIfUseCommaDelimiter, null, "Исх 13:14", "Исх 13:15", "Исх 13:20");
        }

        [TestMethod]
        public void Test18()
        {
            var input = "<span lang=ru>Вот Ин 1</span><span lang=en-US>:</span><span lang=ru>12 где в </span><span lang=ro>:</span><span lang=se-FI>13</span>";
            var expected = "<span lang=\"ru\">Вот <a href='bnVerse:Иоанна 1:12'>Ин 1:12</a></span><span lang=\"en-US\"></span><span lang=\"ru\"> где в </span><span lang=\"ro\"><a href='bnVerse:Иоанна 1:13'>:13</a></span><span lang=\"se-FI\"></span>";

            CheckVerses(input, expected, null, "Ин 1:12", "Ин 1:13");
        }


        [TestMethod]
        public void Test19()
        {
            CheckVerses("Иуда 14,15", null, null, "Иуд 1:14", "Иуд 1:15");
            CheckVerses("Иуда 14-15", null, null, "Иуд 1:14-15");
            CheckVerses("2Ин2-3,3Ин3", /*"2Ин 2,3Ин 3"*/ null, null, "2Ин 1:2-3", "3Ин 1:3");
        }

        [TestMethod]
        public void Test20()
        {
            CheckVerses("Ин 20:7-9, Л2", null, null, "Ин 20:7-9");
        }

        [TestMethod]
        public void Test21()
        {
            var input = "Ис 43,4,25,5,26,7";
            var expectedIfNotUseCommaDelimiter = "<a href='bnVerse:Исаия 43'>Ис 43</a>,4,25,5,26,7";
            var expectedIfUseCommaDelimiter = "<a href='bnVerse:Исаия 43:4'>Ис 43,4</a>,<a href='bnVerse:Исаия 43:25'>25</a>,5,26,7";


            MockConfigurationManager.UseCommaDelimiter = false;
            CheckVerses(input, expectedIfNotUseCommaDelimiter, null, "Ис 43");

            MockConfigurationManager.UseCommaDelimiter = true;
            CheckVerses(input, expectedIfUseCommaDelimiter, null, "Ис 43:4", "Ис 43:25");
        }

        [TestMethod]
        public void Test22()
        {
            var input = "Не понимает 'Луки 21-я глава', '1Кор. 1:29 ; 3:21; 4:7', 'В Первом послании к Коринфянам (10:31)'";
            var expected = "Не понимает '<a href='bnVerse:Луки 21'>Луки 21</a>-я глава', '<a href='bnVerse:1Коринфянам 1:29'>1Кор. 1:29</a> ; <a href='bnVerse:1Коринфянам 3:21'>3:21</a>; <a href='bnVerse:1Коринфянам 4:7'>4:7</a>', 'В <a href='bnVerse:1Коринфянам 10:31'>Первом послании к Коринфянам (10:31)</a>'";
            CheckVerses(input, expected, null, "Лк 21", "1Кор 1:29", "1Кор 3:21", "1Кор 4:7", "1Кор 10:31");
        }

        [TestMethod]
        public void Test23()
        {
            CheckVerses(".-5 ин 1:5,6: вот", null, null, "Ин 1:5", "Ин 1:6");
            CheckVerses(".:5 Ин.  (5 : 7), Лк.   (6:7)", null, null, "Ин 5:7", "Лк 6:7");
        }

        [TestMethod]
        public void Test24()
        {
            var input = "<b><b>Ин</b><b>3:16</b></b> <b>Лк<b>5:1<b/>6:2</b>";
            var expected = "<b><b><a href='bnVerse:Иоанна 3:16'>Ин3:16</a></b><b></b></b> <b><a href='bnVerse:Луки 5:16'>Лк5:16</a><b><b></b>:2</b></b>";

            CheckVerses(input, expected, null, "Ин 3:16", "Лк 5:16");
        }

        //todo: [TestMethod]
        public void Test25()
        {
            CheckVerses("Ин 5:6 и 7 стих, 8ст, ст9-11, ст.12,13", null, null, "Ин 5:6", "Ин 5:7", "Ин 5:8", "Ин 5:9-11", "Ин 5:12", "Ин 5:13");
            CheckVerses("ст. 22-23, стихи 23-24, стих 12, гл. 2-3, главы 3-4, глава 6", null,
                docParseContext => docParseContext.SetTitleVerse(new ChapterEntry(versePointerFactory.CreateVersePointer("Ин 3").ToChapterPointer())),
                "Ин 3:22-23", "Ин 3:23-24", "Ин 3:12", "Ин 2-3", "Ин 3-4", "Ин 6");
        }

        [TestMethod]
        public void Test26()
        {
            var input = "<div>Это <p>тестовая <span class='test'></span><font><span></span>Мк <br/> 5:</font><span></span>6-<span data> </span>7!!</p> строка</div>";
            var expected = "<div>Это <p>тестовая <span class='test'></span><font><span></span><a href='bnVerse:Марка 5:6-7'>Мк  5:6- 7</a><br></font><span></span><span data=\"\"></span>!!</p> строка</div>";
            CheckVerses(input, expected, null, "Мк 5:6-7");

            input = "<div><span></span><span></span><span></span>Ин 5:6</div>";
            expected = "<div><span></span><span></span><span></span><a href='bnVerse:Иоанна 5:6'>Ин 5:6</a></div>";
            CheckVerses(input, expected, null, "Ин 5:6");
        }

        [TestMethod]
        public void Test27()
        {
            var input = "<a href='bnVerse:Ин 5:6'>Ин 5:6</a>";
            var expected = "<a href='bnVerse:Иоанна 5:6'>Ин 5:6</a>";
            CheckVerses(input, expected, null, "Ин 5:6");

            input = "<a href='bnVerse:Иоанна 5:6'>Ин 5:6</a>-7";
            expected = "<a href='bnVerse:Иоанна 5:6-7'>Ин 5:6-7</a>";
            CheckVerses(input, expected, null, "Ин 5:6-7");

            //todo: это надо будет вынести в отдельную опцию на увроне INavigationProviderInstance - нужно ли менять чужие ссылки
            input = "<a href='ya.ru'>Ин 5:6</a>-7";
            expected = "<a href='bnVerse:Иоанна 5:6-7'>Ин 5:6-7</a>";
            CheckVerses(input, expected, null, "Ин 5:6-7");

            input = "<a class='test'>Ин 5:6</a>-7";
            expected = "<a class='test' href=\"bnVerse:Иоанна 5:6-7\">Ин 5:6-7</a>";
            CheckVerses(input, expected, null, "Ин 5:6-7");

            input = "<a>Ин 5:6</a>-7";
            expected = "<a href=\"bnVerse:Иоанна 5:6-7\">Ин 5:6-7</a>";
            CheckVerses(input, expected, null, "Ин 5:6-7");
        }

        [TestMethod]
        public void Test28()
        {
            CheckVerses("Иов. 4:5 и  Наум. 1:3", null, null, "Иов 4:5", "Наум 1:3");
            CheckVerses("Бытие. 4:5", null, null);
        }

        [TestMethod]
        public void Test29()
        {            
            CheckVerses("Быт 1:60", null, null, new string[] { "Быт 1:60" }, null);
            CheckVerses("Ин 3:37", null, null, new string[] { "Ин 3:37" }, null);
            CheckVerses("Ин 22", null, null, new string[] { "Ин 22" }, null);
            CheckVerses("Ин 22:1", null, null, new string[] { "Ин 22" }, null);
            CheckVerses("Ин 3:1, Ин 3:36", null, null, "Ин 3:1", "Ин 3:36");
            CheckVerses("Ин 3:30-40", null, null, new string[] { "Ин 3:37" }, "Ин 3:30-36");
        }

        [TestMethod]
        public void Test30()
        {
            CheckVerses("Иуд 9,1 Фесс. 4:16", null, null, "Иуд 1:9", "1Фес 4:16");            
        }

        [TestMethod]
        public void Test31()
        {
            CheckVerses("а также в Гал. 2:1а; 3:8; 3:24а. и :7б", null, null, "Гал 2:1", "Гал 3:8", "Гал 3:24", "Гал 3:7");
        }

        [TestMethod]
        public void Test32()
        {
            CheckVerses("А в 1-м Ин. 5:20, 1-Тим 1:6, 1-Ин 1:1", null, null, "1Ин 5:20", "1Тим 1:6", "1Ин 1:1");
        }

        [TestMethod]
        public void Test33()
        {
            CheckVerses("Римлянам 1-3:20, Второе послание к Тимофею 3:16-17", null, null, "Рим 1-3:20", "2Тим 3:16-17");
        }

        [TestMethod]
        public void Test34()
        {
            CheckVerses("Мф 1:1 ; 2:1 и 3:1", null, null, "Мф 1:1", "Мф 2:1", "Мф 3:1");
        }

        [TestMethod]
        public void Test35()
        {
            CheckVerses("В Псалме (115:3) написано:", null, null, "Пс 115:3");
        }

        [TestMethod]
        public void Test36()
        {
            CheckVerses("(см. Ин. 13:25 и 21:20)", null, null, "Ин 13:25", "Ин 21:20");
        }

        [TestMethod]
        public void Test37()
        {
            var input = "1-еКор.7:15, 1-Кор.7:12, Захарию 11:12-13, В Деяниях Апостолов 9:15, в Исаие 55:8-9, отношение к Откровению 10:6, из текста Деяний апостолов 13:38-39";
            CheckVerses(input, null, null, "1Кор 7:15", "1Кор 7:12", "Зах 11:12-13", "Деян 9:15", "Ис 55:8-9", "Отк 10:6", "Деян 13:38-39");
        }

        [TestMethod]
        public void Test38()
        {
            CheckVerses("1 Пет 5:1,2 Тим 2:2", null, null, "1 Пет 5:1", "2 Тим 2:2");
            CheckVerses("1 Пет 5,1, 2 Тим 2,2", null, null, "1 Пет 5:1", "2 Тим 2:2");
            CheckVerses("1 Пет 5:1,:2 Тим 2:2", null, null, "1 Пет 5:1", "2 Тим 2:2");
            CheckVerses("Ин 1:1 Ин 1:2", null, null, "Ин 1:1", "Ин 1:2");            
        }

        [TestMethod]
        public void Test39()
        {
            CheckVerses("Иуд 4,12,16,19", null, null, "Иуд 1:4", "Иуд 1:12", "Иуд 1:16", "Иуд 1:19");
        }

        [TestMethod]
        public void Test40()
        {   
            CheckVerses("Ин 3:35-37", "<a href='bnVerse:Иоанна 3:35-36'>Ин 3:35-37</a>", null, new string[] { "Ин 3:37" }, "Ин 3:35-36");
            CheckVerses("Ин 3:36-37", "<a href='bnVerse:Иоанна 3:36'>Ин 3:36-37</a>", null, new string[] { "Ин 3:37" }, "Ин 3:36");
            CheckVerses("Ин 21:24-23:3", "<a href='bnVerse:Иоанна 21:24-25'>Ин 21:24-23:3</a>", null, new string[] { "Ин 22" }, "Ин 21:24-25");
            CheckVerses("Ин 20-22", "<a href='bnVerse:Иоанна 20-21'>Ин 20-22</a>", null, new string[] { "Ин 22" }, "Ин 20-21");
            CheckVerses("Ин 21-22", "<a href='bnVerse:Иоанна 21'>Ин 21-22</a>", null, new string[] { "Ин 22" }, "Ин 21");
        }

        [TestMethod]
        public void Test41()
        {
            CheckVerses(
                "начало &nbsp;Рим&nbsp;&nbsp;12&nbsp;:&nbsp;3&nbsp;,&nbsp;1&nbsp;Кор&nbsp;5&nbsp;:&nbsp;6&nbsp; - конец",
                "начало  <a href='bnVerse:Римлянам 12:3'>Рим  12 : 3</a> , <a href='bnVerse:1Коринфянам 5:6'>1 Кор 5 : 6</a>  - конец",
                null,
                "Рим 12:3", "1Кор 5:6");

            var input = @"<span
style='color:#444444' lang=ru>2&nbsp;</span><span
style='font-weight:bold;color:#333333' lang=ru>Рим&nbsp;</span><span
style='font-weight:bold;color:#333333' lang=en-US>12:3</span><span
style='color:#444444' lang=ru>&nbsp;</span>";
            var expected = "<span style='color:#444444' lang=\"ru\">2&nbsp;</span><span style='font-weight:bold;color:#333333' lang=\"ru\"><a href='bnVerse:Римлянам 12:3'>Рим 12:3</a></span><span style='font-weight:bold;color:#333333' lang=\"en-US\"></span><span style='color:#444444' lang=\"ru\">&nbsp;</span>";
            CheckVerses(input, expected, null, "Рим 12:3");
        }

        [TestMethod]
        public void Test42()
        {
            var input = @"<span
style='font-family:Calibri'>, &quot;</span><span style='font-family:Arial;
background:white'> (Рим.&nbsp;</span><span style='font-style:italic;font-family:
Arial;background:white'>6:4);</span><span style='font-family:Arial;background:
white'>&nbsp;в</span><span style='font-family:Calibri'>&quot;</span>";
            var expected = "<span style='font-family:Calibri'>, &quot;</span><span style='font-family:Arial;\r\nbackground:white'> (<a href='bnVerse:Римлянам 6:4'>Рим. 6:4</a></span><span style='font-style:italic;font-family:\r\nArial;background:white'>);</span><span style='font-family:Arial;background:\r\nwhite'>&nbsp;в</span><span style='font-family:Calibri'>&quot;</span>";
            CheckVerses(input, expected, null, "Рим 6:4");
        }

        [TestMethod]
        public void Test43()
        {
            var input = @"<span
style='color:#444444' lang=ru>Когда Бог сотворил человека, Он предупредил его об опасности нарушения Его воли, сказав о дереве познания добра и зла: &quot;если вкусишь от него, смертью умрёшь&quot; (Быт&nbsp;</span><span
style='color:#444444' lang=en-US>2:17). </span>
<span lang=ru>И вас, мертвых по преступлениям и грехам вашим, в которых вы некогда жили, по обычаю мира сего, по воле князя, господствующего в воздухе, духа, действующего ныне в сынах противления, между которыми и мы все жили некогда по нашим плотским похотям, исполняя желания плоти и помыслов, и были по природе чадами гнева, как и прочие. (Еф&nbsp;</span><span
lang=en-US>2:1-3)</span>
<span lang=en-US>...</span><span lang=ru>как написано: нет праведного ни одного; нет разумевающего; никто не ищет Бога; все совратились с пути, до одного негодны; нет делающего добро, нет ни одного. (Рим&nbsp;</span><span
lang=en-US>3:10-12)</span><span
style='font-weight:bold;color:#333333' lang=ru>1 Петра&nbsp;</span><span
style='font-weight:bold;color:#333333' lang=en-US>3:1-6</span><span
style='color:#444444' lang=ru>&nbsp;</span><span
style='font-weight:bold;color:#333333' lang=ru>Притчи&nbsp;</span><span
style='font-weight:bold;color:#333333' lang=en-US>14:1</span><span
style='color:#444444' lang=ru>&nbsp;</span><span
style='color:#444444' lang=ru> (1</span><span style='color:#444444' lang=en-US>&nbsp;Фес 2:8). Именно за это, пастыри дадут особый отчет перед Богом (</span>
<span style='color:#444444' lang=ru>и апостолами (1 Пет&nbsp;</span><span
style='color:#444444' lang=en-US>5:1-3, 2</span><span style='color:#444444'
lang=ru>&nbsp;Тим&nbsp;</span><span style='color:#444444' lang=en-US>2:2). </span>";
            var expected = "<span style='color:#444444' lang=\"ru\">Когда Бог сотворил человека, Он предупредил его об опасности нарушения Его воли, сказав о дереве познания добра и зла: &quot;если вкусишь от него, смертью умрёшь&quot; (<a href='bnVerse:Бытие 2:17'>Быт 2:17</a></span><span style='color:#444444' lang=\"en-US\">). </span>\r\n<span lang=\"ru\">И вас, мертвых по преступлениям и грехам вашим, в которых вы некогда жили, по обычаю мира сего, по воле князя, господствующего в воздухе, духа, действующего ныне в сынах противления, между которыми и мы все жили некогда по нашим плотским похотям, исполняя желания плоти и помыслов, и были по природе чадами гнева, как и прочие. (<a href='bnVerse:Ефесянам 2:1-3'>Еф 2:1-3</a></span><span lang=\"en-US\">)</span>\r\n<span lang=\"en-US\">...</span><span lang=\"ru\">как написано: нет праведного ни одного; нет разумевающего; никто не ищет Бога; все совратились с пути, до одного негодны; нет делающего добро, нет ни одного. (<a href='bnVerse:Римлянам 3:10-12'>Рим 3:10-12</a></span><span lang=\"en-US\">)</span><span style='font-weight:bold;color:#333333' lang=\"ru\"><a href='bnVerse:1Петра 3:1-6'>1 Петра 3:1-6</a></span><span style='font-weight:bold;color:#333333' lang=\"en-US\"></span><span style='color:#444444' lang=\"ru\">&nbsp;</span><span style='font-weight:bold;color:#333333' lang=\"ru\"><a href='bnVerse:Притчи 14:1'>Притчи 14:1</a></span><span style='font-weight:bold;color:#333333' lang=\"en-US\"></span><span style='color:#444444' lang=\"ru\">&nbsp;</span><span style='color:#444444' lang=\"ru\"> (<a href='bnVerse:1Фессалоникийцам 2:8'>1 Фес 2:8</a></span><span style='color:#444444' lang=\"en-US\">). Именно за это, пастыри дадут особый отчет перед Богом (</span>\r\n<span style='color:#444444' lang=\"ru\">и апостолами (<a href='bnVerse:1Петра 5:1-3'>1 Пет 5:1-3</a></span><span style='color:#444444' lang=\"en-US\">, <a href='bnVerse:2Тимофею 2:2'>2 Тим 2:2</a></span><span style='color:#444444' lang=\"ru\"></span><span style='color:#444444' lang=\"en-US\">). </span>";
            CheckVerses(input, expected, null, "Быт 2:17", "Еф 2:1-3", "Рим 3:10-12", "1Пет 3:1-6", "Притч 14:1", "1Фес 2:8", "1Пет 5:1-3", "2Тим 2:2");
        }     

        [TestMethod]
        public void Test44()
        {
            var input = @"
        Троица (<a href='bnVerse:Иоанна 1:1'>Ин 1:1</a>)
    ";
            CheckVerses(input, input, null, "Ин 1:1");
        }

        [TestMethod]
        public void Test45()
        {
            var input = @"Всё сотворено Им и для Него (<a href='bnVerse:Евреям 1:2'>Евр.1:2</a>, <a href='bnVerse:Евреям 1:10'>10</a>)";
            CheckVerses(input, input, null, "Евр.1:2", "Евр.1:10");
        }

        [TestMethod]
        public void Test46()
        {
            var input = @"Ps 56:4";
            CheckVerses(input, null, null, "Пс 55:5");
        }


        [TestMethod]
        public void Test47()
        {
            var input = @"Ps 56:5,6";
            CheckVerses(input, null, null, "Пс 55:6", "Пс 55:7");
        }

        [TestMethod]
        public void Test48()
        {
            var input = @" Ps 56:7-8,9";
            CheckVerses(input, null, null, "Пс 55:8-9", "Пс 55:10");
        }

        [TestMethod]
        public void Test49()
        {
            var input = @" Ps 56:7-8,9, 57:4-5,6";
            CheckVerses(input, null, null, "Пс 55:8-9", "Пс 55:10", "Пс 56:5-6", "Пс 56:7");
        }


        [TestMethod]
        public void Test50()
        {
            var input = "\nPs 56:7 and 57:4 and :5";
            CheckVerses(input, null, null, "Пс 55:8", "Пс 56:5", "Пс 56:6");
        }

        [TestMethod]
        public void Test51()
        {
            var input = @"Luke 0:7 and Лк 7:0 and Lk 0 and :6 and Lk 5";
            CheckVerses(input, null, null, "Лк 7", "Лк 7:6", "Лк 5");       // todo: возможно, не надо поддерживать два первых VersePointer-a
        }
    }
}