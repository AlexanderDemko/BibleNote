using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Entities
{
    public class DocumentFolder
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)] 
        public int DocumentFolderId { get; set; }

        [Required]
        public string Name { get; set; }
    }
}
