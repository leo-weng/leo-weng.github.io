<html>
<head>
    <title>Contact Form</title>
    <link rel="stylesheet" href="stylesheet.css" type="text/css">
    <script src="//code.jquery.com/jquery-1.10.2.js"></script>
    <script>
    $(function(){
      $("#header").load("header.html");
      // $("#footer").load("footer.html");
    });
    </script>
</head>
</html>

<?php
    function test_input($data) {
        $data = trim($data);
        $data = stripslashes($data);
        $data = htmlspecialchars($data);
        return $data;
    }

    if(isset($_POST['send'])){
        $recipient = "mweng6@gatech.edu";
        $name = test_input($_POST["name"]);
        $email = test_input($_POST["email"]);
        $msg = test_input($_POST["msg"]);
        $errors = array();

        if (!preg_match('/^[a-z ]+$/i', $name)) {
            $errors[] = "Invalid name"
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors[] = "Invalid email format";
        }
        if (preg_match('/^\s*$/', $msg)) {
            $errors[] = "Your message was blank";
        }

        $subject = "Email Inquiry from " . $name;

        if (count($errors)) {
            foreach ($errors as $error) {
                echo "<p>Test</p>\\n";
            }
        } else {
            mail($recipient, $subject, $msg, "From: $name <$email>\r\n Reply-To: $name <$email>\r\n");
            echo "<p>Success!</p>\\n";
        }
    }
?>
