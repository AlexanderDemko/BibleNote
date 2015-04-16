using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Web.Http;
using model=Word.Model.Entities;

namespace Word.Web.Controllers
{
    public class VerseController : ApiController
    {
        [Route("api/Verse/{reference}/{page}")]
        public List<model.Verse> Get(int reference,int page)
        {
            var verse =new model.Verse() { Reference = 123, RefName = "First Paragraph", Number = 42234};
            string text = "Lorem ipsum — dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat.[1] Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
            var rgxp = @"\w+|([\,\;\.\s\[\]\—]+)";
            var words = new List<model.Word>();
            int i = 0;
            foreach (Match match in Regex.Matches(text, rgxp))
            { 
                var word = new model.Word(){Text=match.Value};
                 if(!Regex.IsMatch(match.Value,@"^([\,\;\.\s\[\]\—]+)$"))
                 {
                    word.IsText = true;
                 }
                 word.Number = ++i;
                 word.Reference = verse.Reference;
                words.Add(word);
                
            }
            verse.Words = words;
            
            return new List<model.Verse> {verse};
        }
    }
}
